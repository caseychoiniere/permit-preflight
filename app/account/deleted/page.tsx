import { Container } from "../../components/ui/Container.js";
import { Card } from "../../components/ui/Card.js";

/** Confirmation view after deleteAccount - deliberately not the login page directly, to avoid
 * implying anything about whether signing in with the same email would succeed. */
export default function AccountDeletedPage() {
  return (
    <Container className="max-w-md">
      <Card>
        <h1 className="text-lg font-semibold text-slate-900">Your account has been deleted</h1>
        <p className="mt-2 text-sm text-slate-600">Your account and its sessions/links have been removed. Any prior orders and reports remain accessible via their original links.</p>
        <a href="/" className="mt-3 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Return home
        </a>
      </Card>
    </Container>
  );
}
