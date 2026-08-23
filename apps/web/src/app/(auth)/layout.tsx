/** Sign-in, sign-up and onboarding stay a single narrow column at every width —
 *  a login form has no business spanning a desktop monitor. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[560px] min-h-dvh relative">{children}</div>;
}
