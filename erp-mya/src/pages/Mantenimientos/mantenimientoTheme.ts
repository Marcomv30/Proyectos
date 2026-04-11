export const mantenimientoBaseStyles = `
  .mnt-wrap { padding:0; color:var(--card-text); }
  .mnt-title { color:var(--card-text); letter-spacing:-0.02em; }
  .mnt-sub { color:var(--gray-400); }
  .mnt-card {
    background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg));
    border:1px solid var(--card-border);
    box-shadow:0 18px 30px rgba(3,8,20,.18);
  }
  .mnt-btn {
    border:1px solid var(--card-border);
    background:color-mix(in srgb, var(--bg-dark2) 82%, var(--card-bg));
    color:var(--card-text);
    transition:border-color .15s, background .15s, color .15s, opacity .15s;
  }
  .mnt-btn:hover:not(:disabled) {
    border-color:color-mix(in srgb, var(--green-main) 40%, var(--card-border));
    background:color-mix(in srgb, var(--green-main) 10%, var(--bg-dark2));
  }
  .mnt-btn-primary {
    border-color:color-mix(in srgb, var(--green-main) 36%, var(--card-border));
    background:linear-gradient(135deg, color-mix(in srgb, var(--green-main) 70%, var(--bg-dark2)), var(--green-main));
    color:#fff;
  }
  .mnt-input,
  .mnt-select,
  .mnt-text {
    border:1px solid color-mix(in srgb, var(--card-border) 82%, var(--green-main));
    background:color-mix(in srgb, var(--bg-dark2) 44%, var(--card-bg));
    color:var(--card-text);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.03);
  }
  .mnt-input::placeholder,
  .mnt-text::placeholder { color:var(--gray-400); }
  .mnt-input:disabled,
  .mnt-select:disabled,
  .mnt-text:disabled {
    background:color-mix(in srgb, var(--bg-dark2) 40%, var(--card-bg));
    border-color:color-mix(in srgb, var(--card-border) 78%, var(--bg-dark));
    color:color-mix(in srgb, var(--card-text) 74%, var(--gray-400));
    opacity:1;
    cursor:not-allowed;
  }
  .mnt-input:focus,
  .mnt-select:focus,
  .mnt-text:focus {
    outline:none;
    border-color:var(--green-main);
    box-shadow:0 0 0 2px color-mix(in srgb, var(--green-main) 18%, transparent);
  }
  .mnt-label {
    color:color-mix(in srgb, var(--green-main) 55%, var(--card-text));
    text-transform:uppercase;
    letter-spacing:.03em;
    font-weight:700;
  }
  .mnt-table-wrap {
    border:1px solid var(--card-border);
    background:color-mix(in srgb, var(--bg-dark) 76%, var(--card-bg));
  }
`;
