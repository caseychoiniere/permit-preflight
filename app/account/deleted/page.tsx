/** Confirmation view after deleteAccount - deliberately not the login page directly, to avoid
 * implying anything about whether signing in with the same email would succeed. */
export default function AccountDeletedPage() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      <h1>Your account has been deleted</h1>
      <p>Your account and its sessions/links have been removed. Any prior orders and reports remain accessible via their original links.</p>
      <a href="/">Return home</a>
    </main>
  );
}
