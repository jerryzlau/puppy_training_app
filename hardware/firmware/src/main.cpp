// Biru Buttons — breadboard firmware.
// TWO buttons, one per kind: GPIO18 = pee (💦), GPIO19 = poop (💩). Each button
// sits between its GPIO and GND (internal pull-up, pressed = LOW); one press =
// one event. An optional 0.96" SSD1306 OLED on I2C (SDA 21 / SCL 22) shows
// today's tally: refreshed from GET /ingest/today every few minutes and from
// the press response the instant a button is hit. Each press is POSTed to BIRU_API_URL (platformio.ini; the local mock by
// default) with the unix time of the click. Presses are queued in RAM and sent by
// a background task on the other core, so the button stays responsive while WiFi
// or the request is slow. Nothing here touches a database directly.
//
// Pairing (PLAN.md §3): the device token lives in NVS. With no token the board
// is UNPAIRED — it trades a claim code (from the Family page) for a token via
// POST /devices/claim. The code comes from BIRU_CLAIM_CODE in secrets.h or is
// typed into the serial monitor as `claim K7F3QM`. Hold either button 10 s (or
// type `reset`) to forget the token and pair again.
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <esp_sntp.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "secrets.h"
#include "certs.h"

#ifndef BIRU_API_URL
#error "BIRU_API_URL must be set in platformio.ini build_flags"
#endif

static const int LED_PIN = 2;       // onboard blue LED

// One button per kind. 30-pin ESP32 devkit: D18 and D19 are neighbours on the
// 3V3/GND side of the board, which is the side with a free breadboard column
// beside the pins. On the ESP32-C3 SuperMini use 3 and 4 instead.
#if CONFIG_IDF_TARGET_ESP32C3
static const int PEE_PIN = 3;
static const int POOP_PIN = 4;
static const int I2C_SDA = 5, I2C_SCL = 6;
#else
static const int PEE_PIN = 18;
static const int POOP_PIN = 19;
static const int I2C_SDA = 21, I2C_SCL = 22;   // the devkit's default I2C pins
#endif
static const uint8_t OLED_ADDR = 0x3C;
static const uint32_t TODAY_REFRESH_MS = 5 * 60 * 1000;

static const uint32_t DEBOUNCE_MS = 30;
static const size_t QUEUE_LEN = 32;

struct Press {
  char kind[6];       // "pee" | "poop"
  char pressId[37];   // uuid v4 string
  time_t pressedAt;   // unix seconds of the press, 0 = clock not synced yet
};

static QueueHandle_t pressQueue;
static Preferences prefs;
static String deviceToken;  // empty = unpaired
static const uint32_t RESET_HOLD_MS = 10000;

// ---------- screen state (written by either task, drawn by loop) ----------

enum Status : uint8_t { ST_BOOT, ST_WIFI, ST_UNPAIRED, ST_OK, ST_SENDING, ST_SENT, ST_FAILED, ST_OFFLINE };
static volatile int todayPee = -1, todayPoop = -1;  // -1 = not fetched yet
static volatile Status status = ST_BOOT;
static volatile bool screenDirty = true;
static volatile uint32_t statusSince = 0;        // for transient states (SENT/FAILED)
static volatile bool refreshWanted = true;       // sender task: fetch /ingest/today asap

static void setStatus(Status s) { status = s; statusSince = millis(); screenDirty = true; }

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
  uint32_t t0 = millis();
  int code = http.POST(body);
  String resp = http.getString();
  http.end();
  // responses handed back to the caller (the claim) can hold the token — don't log them
  Serial.printf("http: POST %s %s -> %d %s (%lu ms)\n", path, body.c_str(), code, out ? "" : resp.c_str(),
                (unsigned long)(millis() - t0));
  if (out) *out = resp;
  return code;
}

// GET BIRU_API_URL + path with the device token. Returns the HTTP status.
static int getJson(const char* path, String* out) {
  String url = String(BIRU_API_URL) + path;
  HTTPClient http;
  WiFiClient plain;
  WiFiClientSecure tls;
  bool https = url.startsWith("https://");
  if (https) tls.setCACert(BIRU_CA_BUNDLE);
  bool ok = https ? http.begin(tls, url) : http.begin(plain, url);
  if (!ok) return -1;
  http.setTimeout(10000);
  http.addHeader("Authorization", String("Device ") + deviceToken);
  uint32_t t0 = millis();
  int code = http.GET();
  *out = http.getString();
  http.end();
  Serial.printf("http: GET %s -> %d %s (%lu ms)\n", path, code, out->c_str(), (unsigned long)(millis() - t0));
  return code;
}

// Pull an integer field out of a flat JSON object, e.g. jsonInt(body, "pee").
// -1 when absent. Good enough for {"day":"…","pee":3,"poop":1,"food":2}.
static int jsonInt(const String& json, const char* key) {
  String needle = String("\"") + key + "\":";
  int k = json.indexOf(needle);
  if (k < 0) return -1;
  return json.substring(k + needle.length()).toInt();
}

// Apply a today-tally object (from GET /ingest/today or the press response).
static void applyToday(const String& json) {
  int pee = jsonInt(json, "pee"), poop = jsonInt(json, "poop");
  if (pee < 0 || poop < 0) return;
  todayPee = pee; todayPoop = poop;
  screenDirty = true;
}

static bool fetchToday() {
  if (deviceToken.isEmpty() || !ensureWifi()) return false;
  String resp;
  int code = getJson("/ingest/today", &resp);
  if (code != 200) return false;
  applyToday(resp);
  return true;
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
  setStatus(ST_OK);
  refreshWanted = true;
  blink(1, 1000, 0);
  return true;
}

static void forgetDevice() {
  prefs.remove("token");
  deviceToken = "";
  todayPee = todayPoop = -1;
  setStatus(ST_UNPAIRED);
  Serial.println("reset: token wiped — UNPAIRED. add a button pad on the Family page and `claim <code>`.");
  blink(6, 50, 50);
}

// POST one press. Returns true when the server accepted it (or already had it).
static bool sendPress(const Press& p) {
  String body = String("{\"kind\":\"") + p.kind + "\",\"pressId\":\"" + p.pressId + "\",\"pressedAt\":";
  body += p.pressedAt ? String((unsigned long)p.pressedAt) : String("null");
  body += "}";

  String resp;
  int code = postJson("/ingest/routine", body, deviceToken.c_str(), &resp);
  Serial.printf("http: %d %s\n", code, resp.c_str());  // no token in a press response
  if (code == 201 || code == 200) applyToday(resp);   // both carry today's tally
  // 201 logged, 200 duplicate (retry after timeout) — both mean "done".
  // 4xx means the server rejected it; retrying won't help, drop it.
  return code == 201 || code == 200 || (code >= 400 && code < 500);
}

static void senderTask(void*) {
  Press p;
  uint32_t lastRefresh = 0;
  for (;;) {
    if (xQueueReceive(pressQueue, &p, pdMS_TO_TICKS(1000)) == pdTRUE) {
      setStatus(ST_SENDING);
      bool sent = false;
      for (int attempt = 1; attempt <= 3 && !sent; attempt++) {
        if (ensureWifi()) sent = sendPress(p);
        if (!sent) { Serial.printf("send: retry %d/3 in 2 s\n", attempt); delay(2000); }
      }
      if (sent) {
        setStatus(ST_SENT);
        blink(1, 400, 0);                       // one long blink = logged
      } else {
        Serial.println("send: giving up on this press");
        setStatus(ST_FAILED);
        blink(4, 60, 60);                       // fast flutter = failed
      }
      continue;
    }
    // idle: keep the tally fresh (also rolls it to 0/0 after midnight)
    if (!deviceToken.isEmpty() && (refreshWanted || millis() - lastRefresh > TODAY_REFRESH_MS)) {
      refreshWanted = false;
      lastRefresh = millis();
      bool ok = fetchToday();
      if (status == ST_BOOT || status == ST_OK || status == ST_OFFLINE || status == ST_WIFI)
        setStatus(ok ? ST_OK : ST_OFFLINE);
    }
  }
}

// ---------- screen (runs on loop) ----------

static Adafruit_SSD1306 oled(128, 64, &Wire, -1);
static bool hasScreen = false;

// 💦 as a droplet: a triangle on a circle, plus a small shine.
static void drawDrop(int x, int y) {
  oled.fillTriangle(x + 8, y, x + 1, y + 10, x + 15, y + 10, SSD1306_WHITE);
  oled.fillCircle(x + 8, y + 11, 7, SSD1306_WHITE);
  oled.fillCircle(x + 5, y + 11, 1, SSD1306_BLACK);
}

// 💩 as three stacked blobs with two eyes.
static void drawPoop(int x, int y) {
  oled.fillCircle(x + 8, y + 15, 8, SSD1306_WHITE);
  oled.fillCircle(x + 8, y + 9, 6, SSD1306_WHITE);
  oled.fillCircle(x + 8, y + 4, 4, SSD1306_WHITE);
  oled.fillCircle(x + 9, y + 1, 2, SSD1306_WHITE);
  oled.fillCircle(x + 6, y + 12, 1, SSD1306_BLACK);
  oled.fillCircle(x + 11, y + 12, 1, SSD1306_BLACK);
}

static void drawCount(int x, int count) {
  oled.setTextSize(3);  // 18x24 px digits: room for two per side
  oled.setCursor(x, 26);
  if (count < 0) oled.print("-");
  else oled.print(count);
}

static void render() {
  if (!hasScreen) return;
  screenDirty = false;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(1);

  // header: name + local time
  oled.setCursor(0, 0);
  oled.print("biru  today");
  if (clockSynced()) {
    struct tm t;
    time_t now = time(nullptr);
    localtime_r(&now, &t);
    char hm[6];
    snprintf(hm, sizeof hm, "%02d:%02d", t.tm_hour, t.tm_min);
    oled.setCursor(128 - 5 * 6, 0);
    oled.print(hm);
  }

  drawDrop(2, 26);   drawCount(22, todayPee);
  drawPoop(68, 26);  drawCount(88, todayPoop);

  // footer: status
  const char* msg = "";
  switch (status) {
    case ST_BOOT:     msg = "starting..."; break;
    case ST_WIFI:     msg = "wifi..."; break;
    case ST_UNPAIRED: msg = "UNPAIRED - claim code"; break;
    case ST_OK:       msg = ""; break;
    case ST_SENDING:  msg = "sending..."; break;
    case ST_SENT:     msg = "logged!"; break;
    case ST_FAILED:   msg = "couldn't send"; break;
    case ST_OFFLINE:  msg = "offline"; break;
  }
  oled.setCursor(0, 56);
  oled.print(msg);
  oled.display();
}

// ---------- buttons (run on loop) ----------

struct Button {
  const char* kind;   // "pee" | "poop"
  int pin;
  bool down;
  uint32_t lastEdge;
  time_t pressedAt;   // unix time when it went down
};

static Button buttons[] = {{"pee", PEE_PIN, false, 0, 0}, {"poop", POOP_PIN, false, 0, 0}};

// Queue one press of `kind`, stamped `at` (0 = clock not synced, server time).
static void emit(const char* kind, time_t at) {
  if (deviceToken.isEmpty()) {
    Serial.printf("button: %s ignored — UNPAIRED (type `claim <code>` from the Family page)\n", kind);
    blink(4, 60, 60);
    return;
  }
  Press p{};
  strncpy(p.kind, kind, sizeof(p.kind) - 1);
  uuid4(p.pressId);
  p.pressedAt = at;
  Serial.printf("button: %s at %lu -> queued\n", kind, (unsigned long)p.pressedAt);
  if (xQueueSend(pressQueue, &p, 0) != pdTRUE) Serial.println("button: queue full, dropped");
  blink(strcmp(kind, "poop") == 0 ? 2 : 1, 80, 80);  // 1 blink = pee, 2 = poop
}

// Debounced press/release for one button. A press is logged on release so a
// 10 s hold can turn into "un-pair" without also logging an event.
static void pollButton(Button& b, uint32_t now) {
  bool raw = digitalRead(b.pin) == LOW;
  if (raw != b.down && now - b.lastEdge > DEBOUNCE_MS) {
    b.down = raw;
    b.lastEdge = now;
    if (b.down) {
      b.pressedAt = clockSynced() ? time(nullptr) : 0;
    } else {
      emit(b.kind, b.pressedAt);
    }
  }
  if (b.down && now - b.lastEdge > RESET_HOLD_MS) {
    forgetDevice();
    while (digitalRead(b.pin) == LOW) delay(10);  // the release afterwards is not a press
    b.down = false;
    b.lastEdge = millis();
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  for (Button& b : buttons) pinMode(b.pin, INPUT_PULLUP);
  Wire.begin(I2C_SDA, I2C_SCL);
  // begin() doesn't check the bus (it only fails on malloc) — probe for an ACK first.
  Wire.beginTransmission(OLED_ADDR);
  hasScreen = Wire.endTransmission() == 0 && oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (hasScreen) render();
  delay(300);
  Serial.println();
  Serial.printf("biru buttons: ready — pee = GPIO%d, poop = GPIO%d -> %s\n", PEE_PIN, POOP_PIN, BIRU_API_URL);
  Serial.println(hasScreen ? "screen: SSD1306 found at 0x3C" : "screen: no SSD1306 at 0x3C (running without one)");
  prefs.begin("biru", false);
  deviceToken = prefs.getString("token", "");
#if BIRU_MOCK
  if (deviceToken.isEmpty()) deviceToken = BIRU_DEVICE_TOKEN;  // the mock accepts anything
#endif
  pressQueue = xQueueCreate(QUEUE_LEN, sizeof(Press));
  // connect eagerly so the first press doesn't wait on WiFi
  setStatus(ST_WIFI);
  render();
  ensureWifi();
  // Network work on its own task, pinned to core 1 alongside the Arduino loop (which
  // keeps polling buttons — the two time-slice). NOT core 0: the TLS handshake with
  // Railway's ECDSA P-384 chain is ~6 s of pure CPU on an ESP32, and on core 0 that
  // starves the idle task the task watchdog checks -> reboot mid-request.
  // Started only now so its first /ingest/today doesn't race the WiFi/NTP bring-up above.
  xTaskCreatePinnedToCore(senderTask, "sender", 12288, nullptr, 1, nullptr, 1);
  // local time for the screen's clock (the API decides the day; this is cosmetic)
  setenv("TZ", "EST5EDT,M3.2.0,M11.1.0", 1);
  tzset();
  if (deviceToken.isEmpty()) {
#ifdef BIRU_CLAIM_CODE
    Serial.println("pairing with BIRU_CLAIM_CODE from secrets.h…");
    claimDevice(BIRU_CLAIM_CODE);
#endif
    if (deviceToken.isEmpty()) {
      Serial.println("UNPAIRED: add a button pad on the Family page, then type `claim <code>` here");
      setStatus(ST_UNPAIRED);
    }
  } else {
    Serial.println("paired (token in flash). `reset` or hold a button 10 s to un-pair.");
    setStatus(ST_OK);
  }
}

void loop() {
  uint32_t now = millis();
  // serial: `1`/`2` simulate the pee/poop button, `claim K7F3QM` pairs, `reset` un-pairs
  static String line;
  while (Serial.available()) {
    int c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      line.trim();
      if (line == "1" || line == "2") {
        const char* kind = line == "1" ? "pee" : "poop";
        Serial.printf("serial: simulated %s press\n", kind);
        emit(kind, clockSynced() ? time(nullptr) : 0);
      } else if (line.startsWith("claim ")) {
        String code = line.substring(6);
        code.trim();
        code.toUpperCase();
        claimDevice(code);
      } else if (line == "reset") {
        forgetDevice();
      } else if (line.length()) {
        Serial.println("commands: 1 (pee) | 2 (poop) | claim <code> | reset");
      }
      line = "";
    } else if (line.length() < 40) {
      line += (char)c;
    }
  }
  for (Button& b : buttons) pollButton(b, now);
  // "logged!" / "couldn't send" linger 3 s, then back to the plain tally
  if ((status == ST_SENT || status == ST_FAILED) && now - statusSince > 3000) setStatus(ST_OK);
  if (screenDirty) render();
  delay(5);
}
