import React, { useEffect, useState } from "react";

const api = window.uninote;

// Bottom toast that appears when an update is available / downloading / ready.
export default function UpdateNotice() {
  const [st, setSt] = useState(null); // {status, version, percent, error}
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => api.onUpdateStatus((s) => {
    setSt(s);
    if (s.status === "available" || s.status === "ready") setDismissed(false);
  }), []);

  if (!st || dismissed) return null;
  const { status, version, percent } = st;
  if (!["available", "downloading", "ready"].includes(status)) return null;

  return (
    <div className="update-toast">
      {status === "available" && (
        <>
          <span className="update-dot pulse" />
          <div className="update-text">
            <strong>Update available</strong> — downloading UniNote {version} in the background…
          </div>
          <button className="btn tiny" onClick={() => setDismissed(true)}>OK</button>
        </>
      )}
      {status === "downloading" && (
        <>
          <span className="update-dot pulse" />
          <div className="update-text">Downloading update… {percent ?? 0}%</div>
          <div className="update-bar"><div className="update-bar-fill" style={{ width: `${percent ?? 0}%` }} /></div>
        </>
      )}
      {status === "ready" && (
        <>
          <span className="update-dot ready" />
          <div className="update-text">
            <strong>Update ready</strong> — just close and reopen UniNote to finish updating to {version}.
          </div>
          <button className="btn tiny" onClick={() => setDismissed(true)}>Later</button>
          <button className="btn tiny primary" onClick={() => api.updateInstall()}>Restart now</button>
        </>
      )}
    </div>
  );
}
