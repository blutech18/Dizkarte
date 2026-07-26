export default function NotFound() {
  return (
    <main
      id="dk-main-content"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div className="dk-state" role="status">
        <p className="dk-state-title">Page not found</p>
        <p>The page you are looking for does not exist or you may not have access to it.</p>
        <a href="/dashboard" className="dk-btn dk-btn-primary">
          Back to dashboard
        </a>
      </div>
    </main>
  );
}
