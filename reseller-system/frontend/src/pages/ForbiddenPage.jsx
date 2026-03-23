import { Link } from "react-router-dom";

function ForbiddenPage() {
  return (
    <section className="auth-shell">
      <div className="auth-card">
        <h2>Access denied</h2>
        <p>Your role does not have access to this panel.</p>
        <Link to="/login" className="primary-button inline-button">
          Back to login
        </Link>
      </div>
    </section>
  );
}

export default ForbiddenPage;
