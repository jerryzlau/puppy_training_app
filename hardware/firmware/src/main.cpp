// Biru Buttons — breadboard firmware.
// ONE button on GPIO25 decoded by click count: 1 click = pee, 2 quick clicks = poop.
// Each decoded press is POSTed to BIRU_API_URL (platformio.ini; the local mock by
// default) with the unix time of the click. Presses are queued in RAM and sent by
// a background task on the other core, so the button stays responsive while WiFi
// or the request is slow. Nothing here touches a database directly.
//
// Pairing (PLAN.md §3): the device token lives in NVS. With no token the board
// is UNPAIRED — it trades a claim code (from the Family page) for a token via
// POST /devices/claim. The code comes from BIRU_CLAIM_CODE in secrets.h or is
// typed into the serial monitor as `claim K7F3QM`. Hold the button 10 s (or
// type `reset`) to forget the token and pair again.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_sntp.h>
#include <time.h>
#include "secrets.h"
#include "certs.h"

#ifndef BIRU_API_URL
#error "BIRU_API_URL must be set in platformio.ini build_flags"
#endif

static const int LED_PIN = 2;       // onboard blue LED
static const int BUTTON_PIN = 25;

static const uint32_t DEBOUNCE_MS = 30;
static const uint32_t MULTI_CLICK_MS = 400;
static const size_t QUEUE_LEN = 32;

struct Press {
  char kind[6];       // "pee" | "poop"
  char pressId[37];   // uuid v4 string
  time_t pressedAt;   // unix seconds of the FIRST click, 0 = clock not synced yet
};

static QueueHandle_t pressQueue;
static Preferences prefs;
static String deviceToken;  // empty = unpaired
static const uint32_t RESET_HOLD_MS = 10000;

// ---------- helpers ----------

static bool clockSynced() {
  return time(nullptr) > 1700000000L;  // any real date after Nov 2023
}

static void uuid4(char out[37]) {
  uint8_t b[16];
  for (int i = 0; i < 16; i += 4) {
    uint32_t r = esp_random();
    memcpy(b + i, &r, 4);
  }
  b[6] = (b[6] & 0x0f) | 0x40;  // version 4
  b[8] = (b[8] & 0x3f) | 0x80;  // variant
  snprintf(out, 37, "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
           b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
           b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
}

static void blink(uint8_t n, uint16_t onMs, uint16_t offMs) {
  for (uint8_t i = 0; i < n; i++) {
    digitalWrite(LED_PIN, HIGH); delay(onMs);
    digitalWrite(LED_PIN, LOW);  delay(offMs);
  }
}

// ---------- network (runs on the sender task) ----------

static bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.printf("wifi: connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {  // ~20 s
    delay(500);
    Serial.print('.');
  }
  Serial.println();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("wifi: FAILED (check secrets.h; 2.4 GHz networks only)");
    return false;
  }
  Serial.printf("wifi: connected, ip %s\n", WiFi.localIP().toString().c_str());
  if (!clockSynced()) {
    configTime(0, 0, "pool.ntp.org", "time.google.com");
    Serial.print("time: syncing");
    for (int i = 0; i < 20 && !clockSynced(); i++) { delay(250); Serial.print('.'); }
    Serial.println(clockSynced() ? " ok" : " not yet (presses will use server time)");
  }
  return true;
}

// POST a JSON body to BIRU_API_URL + path. token (may be null) goes in the
// Authorization header. Returns the HTTP status (negative = transport error) and
// leaves the response body in *out when given.
static int postJson(const char* path, const String& body, const char* token, String* out) {
  String url = String(BIRU_API_URL) + path;
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure tls;
  bool https = url.startsWith("https://");
  if (https) tls.setCACert(BIRU_CA_BUNDLE);  // pinned ISRG roots (PLAN.md §6)
  bool ok = https ? http.begin(tls, url) : http.begin(plain, url);
  if (!ok) { Serial.println("http: bad url"); return -1; }
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  if (token && *token) http.addHeader("Authorization", String("Device ") + token);
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  // responses handed back to the caller (the claim) can hold the token — don't log them
  Serial.printf("http: POST %s %s -> %d %s\n", path, body.c_str(), code, out ? "" : resp.c_str());
  if (out) *out = resp;
  return code;
}

// Trade a one-time claim code for a device token and persist it (PLAN.md §3).
static bool claimDevice(const String& code) {
  if (!ensureWifi()) return false;
  String resp;
  int status = postJson("/devices/claim", String("{\"claimCode\":\"") + code + "\"}", nullptr, &resp);
  if (status != 201) {
    Serial.printf("claim: rejected (%d) — is the code fresh? codes last 15 min\n", status);
    blink(4, 60, 60);
    return false;
  }
  int k = resp.indexOf("\"deviceToken\":\"");
  if (k < 0) { Serial.println("claim: no token in response"); return false; }
  k += 15;
  int e = resp.indexOf('"', k);
  deviceToken = resp.substring(k, e);
  prefs.putString("token", deviceToken);
  Serial.println("claim: paired! token saved to flash. LED solid 1 s.");
  blink(1, 1000, 0);
  return true;
}

static void forgetDevice() {
  prefs.remove("token");
  deviceToken = "";
  Serial.println("reset: token wiped — UNPAIRED. add a button pad on the Family page and `claim <code>`.");
  blink(6, 50, 50);
}

// POST one press. Returns true when the server accepted it (or already had it).
static bool sendPress(const Press& p) {
  String body = String("{\"kind\":\"") + p.kind + "\",\"pressId\":\"" + p.pressId + "\",\"pressedAt\":";
  body += p.pressedAt ? String((unsigned long)p.pressedAt) : String("null");
  body += "}";

  int code = postJson("/ingest/routine", body, deviceToken.c_str(), nullptr);
  // 201 logged, 200 duplicate (retry after timeout) — both mean "done".
  // 4xx means the server rejected it; retrying won't help, drop it.
  return code == 201 || code == 200 || (code >= 400 && code < 500);
}

static void senderTask(void*) {
  Press p;
  for (;;) {
    if (xQueueReceive(pressQueue, &p, portMAX_DELAY) != pdTRUE) continue;
    bool sent = false;
    for (int attempt = 1; attempt <= 3 && !sent; attempt++) {
      if (ensureWifi()) sent = sendPress(p);
      if (!sent) { Serial.printf("send: retry %d/3 in 2 s\n", attempt); delay(2000); }
    }
    if (sent) {
      blink(1, 400, 0);                       // one long blink = logged
    } else {
      Serial.println("send: giving up on this press");
      blink(4, 60, 60);                       // fast flutter = failed
    }
  }
}

// ---------- button (runs on loop) ----------

static bool down = false;
static uint32_t lastEdge = 0;
static uint8_t clicks = 0;
static uint32_t lastRelease = 0;
static time_t gestureStart = 0;  // unix time at the first click of the gesture

static void emit(uint8_t n) {
  const char* kind = n == 1 ? "pee" : n == 2 ? "poop" : nullptr;
  if (!kind) {
    Serial.printf("button: ignored %u clicks\n", n);
    return;
  }
  if (deviceToken.isEmpty()) {
    Serial.printf("button: %s ignored — UNPAIRED (type `claim <code>` from the Family page)\n", kind);
    blink(4, 60, 60);
    return;
  }
  Press p{};
  strncpy(p.kind, kind, sizeof(p.kind) - 1);
  uuid4(p.pressId);
  p.pressedAt = gestureStart;
  Serial.printf("button: %s (%u click%s) at %lu -> queued\n", kind, n, n == 1 ? "" : "s",
                (unsigned long)p.pressedAt);
  if (xQueueSend(pressQueue, &p, 0) != pdTRUE) Serial.println("button: queue full, dropped");
  blink(n, 80, 80);  // echo the click count
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  delay(300);
  Serial.println();
  Serial.printf("biru buttons: ready — 1 click = pee, 2 clicks = poop -> %s\n", BIRU_API_URL);
  prefs.begin("biru", false);
  deviceToken = prefs.getString("token", "");
#if BIRU_MOCK
  if (deviceToken.isEmpty()) deviceToken = BIRU_DEVICE_TOKEN;  // the mock accepts anything
#endif
  pressQueue = xQueueCreate(QUEUE_LEN, sizeof(Press));
  // network work on core 0; the Arduino loop (button polling) stays on core 1
  xTaskCreatePinnedToCore(senderTask, "sender", 8192, nullptr, 1, nullptr, 0);
  // connect eagerly so the first press doesn't wait on WiFi
  ensureWifi();
  if (deviceToken.isEmpty()) {
#ifdef BIRU_CLAIM_CODE
    Serial.println("pairing with BIRU_CLAIM_CODE from secrets.h…");
    claimDevice(BIRU_CLAIM_CODE);
#endif
    if (deviceToken.isEmpty())
      Serial.println("UNPAIRED: add a button pad on the Family page, then type `claim <code>` here");
  } else {
    Serial.println("paired (token in flash). `reset` or hold the button 10 s to un-pair.");
  }
}

void loop() {
  uint32_t now = millis();
  // serial: `1`/`2` simulate clicks, `claim K7F3QM` pairs, `reset` un-pairs
  static String line;
  while (Serial.available()) {
    int c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line.trim();
      if (line == "1" || line == "2") {
        gestureStart = clockSynced() ? time(nullptr) : 0;
        Serial.printf("serial: simulated %s click(s)\n", line.c_str());
        emit(line[0] - '0');
      } else if (line.startsWith("claim ")) {
        String code = line.substring(6);
        code.trim();
        code.toUpperCase();
        claimDevice(code);
      } else if (line == "reset") {
        forgetDevice();
      } else if (line.length()) {
        Serial.println("commands: 1 | 2 | claim <code> | reset");
      }
      line = "";
    } else if (line.length() < 40) {
      line += (char)c;
    }
  }
  bool raw = digitalRead(BUTTON_PIN) == LOW;
  if (raw != down && now - lastEdge > DEBOUNCE_MS) {
    down = raw;
    lastEdge = now;
    if (down && clicks == 0) gestureStart = clockSynced() ? time(nullptr) : 0;
    if (!down) { clicks++; lastRelease = now; }
  }
  // held 10 s → forget the token (re-pair). The release afterwards is not a click.
  if (down && now - lastEdge > RESET_HOLD_MS) {
    forgetDevice();
    while (digitalRead(BUTTON_PIN) == LOW) delay(10);
    down = false; clicks = 0; lastEdge = millis();
  }
  if (clicks > 0 && !down && now - lastRelease > MULTI_CLICK_MS) {
    emit(clicks);
    clicks = 0;
  }
  delay(5);
}
