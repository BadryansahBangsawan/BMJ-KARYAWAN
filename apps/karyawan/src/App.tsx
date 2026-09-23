import { useMemo, useState } from "react";
import { config, navFor, roleById, type FeatureModule } from "./permissions";
import "./App.css";

type Session = { roleId: string; name: string; email: string };

const compactPinned = 4;

function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "K";
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <section className="card stack">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
    </section>
  );
}

function screenFor(module: FeatureModule) {
  switch (module.id) {
    case "dashboard":
      return null;
    case "absen":
      return (
        <Placeholder
          title="Absen"
          body="Kamera depan + plugin geolocation native. Belum terhubung ke attendance.selfCheckin."
        />
      );
    case "kasbon":
      return (
        <Placeholder
          title="Kasbon"
          body="pending → approved/rejected → disbursed → lunas."
        />
      );
    case "pekerjaan":
      return (
        <Placeholder
          title="Pekerjaan"
          body="Mekanik catat langsung diterima. Supervisor create tetap proses."
        />
      );
    case "toko":
      return (
        <Placeholder title="Toko" body="store.create hanya kasir." />
      );
    case "gaji":
      return (
        <Placeholder
          title="Gaji"
          body="Tampilkan payroll.get. Jangan hitung ulang rumus di klien."
        />
      );
    default:
      return (
        <Placeholder
          title={module.label}
          body="Modul aktif menurut permission. Endpoint menyusul."
        />
      );
  }
}

function Login({
  onDemo,
  onToggleTheme,
}: {
  onDemo: (roleId: string) => void;
  onToggleTheme: () => void;
}) {
  return (
    <div className="shell">
      <header className="top-app-bar">
        <h1>Karyawan</h1>
        <button className="icon-btn" type="button" onClick={onToggleTheme}>
          Tema
        </button>
      </header>
      <main className="content">
        <div className="stack">
          <img src="/logo.png" alt="BMJ" height={72} />
          <h2>Masuk</h2>
          <p className="muted">Aplikasi staf bengkel. Bukan website.</p>
          <input className="field" placeholder="Email" disabled />
          <input className="field" placeholder="Sandi" type="password" disabled />
          <button className="filled" type="button" disabled>
            Masuk
          </button>
          <p className="muted">Demo kerangka</p>
          {config.roles.map((role) => (
            <button
              key={role.id}
              className="tonal"
              type="button"
              onClick={() => onDemo(role.id)}
            >
              Lanjut sebagai {role.label}
            </button>
          ))}
          <p className="muted">
            {config.apiBase}
            <br />
            seed {config.seedPrimary}
          </p>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [path, setPath] = useState("/dasbor");
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");

  const role = roleById(session?.roleId ?? "mekanik");
  const destinations = useMemo(
    () => (session ? navFor(role) : []),
    [session, role],
  );
  const current = destinations.find((module) => module.path === path) ?? destinations[0];
  const overflow = destinations.length > 5 ? destinations.slice(compactPinned) : [];
  const barItems = overflow.length ? destinations.slice(0, compactPinned) : destinations;

  document.documentElement.dataset.theme = theme === "system" ? "" : theme;

  if (!session) {
    return (
      <Login
        onDemo={(roleId) => {
          const next = roleById(roleId);
          setSession({
            roleId: next.id,
            name: `Demo ${next.label}`,
            email: `${next.id}@bmj.local`,
          });
          setPath("/dasbor");
        }}
        onToggleTheme={() =>
          setTheme((value) => (value === "dark" ? "light" : "dark"))
        }
      />
    );
  }

  return (
    <div className="shell">
      <header className="top-app-bar">
        <h1>{current?.label ?? "Karyawan"}</h1>
        <button
          className="icon-btn"
          type="button"
          onClick={() =>
            setTheme((value) => (value === "dark" ? "light" : "dark"))
          }
        >
          Tema
        </button>
        <span className="avatar" title={session.name}>
          {initial(session.name)}
        </span>
        <button className="tonal" type="button" onClick={() => setSession(null)}>
          Keluar
        </button>
      </header>
      <div className="shell-body">
        <nav className="rail" aria-label="Utama">
          {destinations.map((module) => (
            <button
              key={module.id}
              className={`nav-item ${module.path === current?.path ? "active" : ""}`}
              type="button"
              onClick={() => setPath(module.path)}
            >
              {module.label}
            </button>
          ))}
        </nav>
        <main className="content">
          {current?.id === "dashboard" ? (
            <div className="stack" style={{ maxWidth: 40 * 16 }}>
              <h2>
                Halo, {session.name}
              </h2>
              <p className="muted">
                {role.label} · {config.name}
              </p>
              <section className="card">
                <strong>{config.name}</strong>
                <p className="muted">
                  {config.address}
                  <br />
                  Absen dalam {config.radiusM} m · akurasi ≤ {config.maxAccuracyM} m ·{" "}
                  {config.tz}
                </p>
              </section>
              <section className="card">
                <strong>Modul aktif</strong>
                <div className="chips" style={{ marginTop: 12 }}>
                  {destinations.map((module) => (
                    <span className="chip" key={module.id}>
                      {module.label}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          ) : (
            current && screenFor(current)
          )}
        </main>
      </div>
      <nav className="nav-bar" aria-label="Utama">
        {barItems.map((module) => (
          <button
            key={module.id}
            className={`nav-item ${module.path === current?.path ? "active" : ""}`}
            type="button"
            onClick={() => setPath(module.path)}
          >
            {module.label}
          </button>
        ))}
        {overflow.length > 0 ? (
          <button
            className="nav-item"
            type="button"
            onClick={() => setPath(overflow[0].path)}
          >
            Lainnya
          </button>
        ) : null}
      </nav>
    </div>
  );
}
