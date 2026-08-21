export function ProductMark() {
  return (
    <div className="product-mark" data-testid="product-mark">
      <div className="product-mark-icon" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </div>
      <div className="product-mark-text">
        <span className="product-mark-title">SQE Platform</span>
        <span className="product-mark-badge">AI Quality Engineering</span>
      </div>
    </div>
  );
}
