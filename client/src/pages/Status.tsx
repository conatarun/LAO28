import { useEffect, useState } from "react";
import { api } from "../api.js";

export default function StatusPage() {
  const [status, setStatus] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [triggering, setTriggering] = useState(false);

  const load = () => {
    api.status().then(setStatus);
    api.refreshLog().then(setLog);
  };
  useEffect(load, []);

  const trigger = async () => {
    setTriggering(true);
    try {
      await api.triggerRefresh();
      load();
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Data refresh status</h2>
        <button className="btn" onClick={trigger} disabled={triggering}>
          {triggering ? "Refreshing…" : "Refresh now"}
        </button>
      </div>

      {status && (
        <div className="grid md:grid-cols-4 gap-3">
          <Stat label="Healthy" value={status.healthy ? "yes" : "no"} bad={!status.healthy} />
          <Stat label="Current version" value={status.current_version ?? "—"} />
          <Stat label="Sessions" value={status.sessions_count} />
          <Stat label="Venues" value={status.venues_count} />
        </div>
      )}

      {status?.last_attempt?.error && (
        <div className="card border-red-300 bg-red-50">
          <div className="font-semibold text-red-700">Last refresh error</div>
          <pre className="text-xs mt-2 whitespace-pre-wrap text-red-900">
            {status.last_attempt.error}
          </pre>
        </div>
      )}

      <div>
        <h3 className="font-semibold mb-2">Refresh log</h3>
        <div className="card p-0 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/5">
              <tr>
                <th className="text-left px-3 py-2">When</th>
                <th className="text-left px-3 py-2">OK</th>
                <th className="text-left px-3 py-2">Version</th>
                <th className="text-right px-3 py-2">PDFs</th>
                <th className="text-right px-3 py-2">Sessions</th>
                <th className="text-right px-3 py-2">ms</th>
                <th className="text-left px-3 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r) => (
                <tr key={r.id} className="border-t border-black/5">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(r.ran_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {r.ok ? (
                      <span className="text-green-700">✓</span>
                    ) : (
                      <span className="text-red-700">✗</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.source_version ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{r.pdfs_downloaded}</td>
                  <td className="px-3 py-2 text-right">{r.sessions_parsed}</td>
                  <td className="px-3 py-2 text-right">{r.duration_ms}</td>
                  <td className="px-3 py-2 text-red-700 max-w-xs truncate">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {status?.raw_preview && (
        <div>
          <h3 className="font-semibold mb-2">Last PDF text preview</h3>
          <pre className="card text-xs whitespace-pre-wrap max-h-96 overflow-auto">
            {status.raw_preview}
          </pre>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: any; bad?: boolean }) {
  return (
    <div className={"card " + (bad ? "border-red-300 bg-red-50" : "")}>
      <div className="text-xs text-black/50">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
