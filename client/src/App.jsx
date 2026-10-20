import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { api, getToken, setToken } from "./api";

/* ---------------------------------------------------------
   DATA
--------------------------------------------------------- */

// NGOs, campaigns and donations now come from the backend API (see ./api.js).

// The five tracking stages. The server decides which stage a donation is in.
const ITEM_STAGES = [
  "Donation Submitted",
  "NGO Matched",
  "Pickup Scheduled",
  "In Transit",
  "Delivered"
];

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// Which pages need a login, and which account type each one belongs to.
const DONOR_PAGES = ["dashboard", "donateItems", "donateMoney"];
const NGO_PAGES = ["ngoDashboard", "createCampaign"];
const AUTH_PAGES = [...DONOR_PAGES, ...NGO_PAGES, "history", "track", "profile"];

// Deterministic pseudo-random pin placement so the map panel scales past 5 pins.
function pinPosition(id) {
  const seedA = (id * 9301 + 49297) % 233280;
  const seedB = (id * 49297 + 9301 + 111) % 233280;
  const left = 10 + (seedA / 233280) * 72;
  const top = 10 + (seedB / 233280) * 52;
  return { left: `${left}%`, top: `${top}%` };
}

function statusClass(status) {
  if (status === "Delivered" || status === "Payment Successful") return "success";
  if (status === "In Transit") return "info";
  if (status === "Pickup Scheduled" || status === "NGO Matched") return "warning";
  return "pending";
}

/* ---------------------------------------------------------
   APP
--------------------------------------------------------- */

function App() {
  const [page, setPage] = useState("home");
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(() => !getToken());
  const [pendingPage, setPendingPage] = useState(null);

  // Data that now lives on the server.
  const [ngos, setNgos] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [donations, setDonations] = useState([]);
  const [dataError, setDataError] = useState("");

  const [selectedNGO, setSelectedNGO] = useState(null);
  const [selectedDonation, setSelectedDonation] = useState(null);
  const [notification, setNotification] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [regionFilter, setRegionFilter] = useState("All Regions");
  const [mapSearch, setMapSearch] = useState("");
  const [trackFocusId, setTrackFocusId] = useState(null);

  /* ---------- loading data from the API ---------- */

  const loadPublicData = useCallback(async () => {
    try {
      const [ngoResult, campaignResult] = await Promise.all([api.ngos(), api.campaigns()]);
      setNgos(ngoResult.ngos);
      setCampaigns(campaignResult.campaigns);
      setDataError("");
    } catch (err) {
      setDataError(err.message);
    }
  }, []);

  const loadDonations = useCallback(async () => {
    try {
      const result = await api.donations();
      setDonations(result.donations);
    } catch (err) {
      if (err.status === 401) {
        setToken(null);
        setUser(null);
        setDonations([]);
        setNotification("Your session has expired. Please log in again.");
        setPage("login");
      }
    }
  }, []);

  useEffect(() => {
    loadPublicData();
  }, [loadPublicData]);

  // Restore the login when the page is refreshed.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((result) => setUser(result.user))
      .catch((err) => {
        if (err.status === 401) setToken(null);
        else setNotification(err.message);
      })
      .finally(() => setAuthReady(true));
  }, []);

  useEffect(() => {
    if (user) loadDonations();
  }, [user, loadDonations]);

  // While any item is still on its way, re-check the server every few seconds.
  const hasLiveDonation = donations.some(
    (donation) => donation.type !== "Money" && donation.status !== "Delivered"
  );
  useEffect(() => {
    if (!user || !hasLiveDonation) return;
    const timer = setInterval(loadDonations, 4000);
    return () => clearInterval(timer);
  }, [user, hasLiveDonation, loadDonations]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(""), 3500);
    return () => clearTimeout(timer);
  }, [notification]);

  /* ---------- navigation ---------- */

  const navigate = (destination) => {
    setPage(destination);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Same as navigate, but sends visitors to the right place for their login state / account type.
  const go = (destination) => {
    if (AUTH_PAGES.includes(destination) && !user) {
      setPendingPage(destination);
      setNotification("Please log in to continue.");
      return navigate("login");
    }
    if (user?.role === "NGO" && DONOR_PAGES.includes(destination)) {
      setNotification("Donating is available on donor accounts.");
      return navigate("ngoDashboard");
    }
    if (user?.role === "Donor" && NGO_PAGES.includes(destination)) {
      return navigate("dashboard");
    }
    navigate(destination);
  };

  /* ---------- accounts ---------- */

  const completeAuth = (result, message) => {
    const isNGO = result.user.role === "NGO";
    const wanted =
      pendingPage && (isNGO ? !DONOR_PAGES.includes(pendingPage) : !NGO_PAGES.includes(pendingPage))
        ? pendingPage
        : null;

    setToken(result.token);
    setUser(result.user);
    setPendingPage(null);
    setNotification(message);
    navigate(wanted || (isNGO ? "ngoDashboard" : "dashboard"));
  };

  const login = async (email, password) => {
    const result = await api.login({ email, password });
    completeAuth(result, `Welcome back, ${result.user.name}!`);
  };

  const register = async (details) => {
    const result = await api.register(details);
    completeAuth(result, `Welcome, ${result.user.name}!`);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setDonations([]);
    navigate("home");
    setNotification("You have been logged out.");
  };

  const openGoogleMaps = (ngo) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${ngo.lat},${ngo.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Builds a location-scoped map query so results stay relevant instead of
  // returning matches from anywhere in the world.
  const searchGoogleMaps = () => {
    const base =
      mapSearch.trim() ||
      [categoryFilter !== "All" ? categoryFilter : "", "NGO"].filter(Boolean).join(" ");

    const regionSuffix = regionFilter !== "All Regions" ? regionFilter : "India";
    const alreadyScoped = base.toLowerCase().includes(regionSuffix.toLowerCase());
    const query = alreadyScoped ? base : `${base} ${regionSuffix}`;

    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Uses real browser geolocation (with a graceful fallback) instead of a
  // bare "NGOs near me" text search, which is what was returning worldwide results.
  const findNearbyNGOs = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          window.open(
            `https://www.google.com/maps/search/NGOs/@${latitude},${longitude},13z`,
            "_blank",
            "noopener,noreferrer"
          );
        },
        () => {
          window.open(
            "https://www.google.com/maps/search/?api=1&query=NGO%20India",
            "_blank",
            "noopener,noreferrer"
          );
        }
      );
    } else {
      window.open(
        "https://www.google.com/maps/search/?api=1&query=NGO%20India",
        "_blank",
        "noopener,noreferrer"
      );
    }
  };

  const addDonation = async (payload) => {
    const result = await api.createDonation(payload); // throws on error - the form shows the message
    const donation = result.donation;
    const isItem = donation.type !== "Money";

    setDonations((previous) => [donation, ...previous]);
    if (!isItem) loadPublicData(); // refresh the campaign's "raised" amount
    setNotification(`Donation submitted successfully! ID: ${donation.id}`);
    setTrackFocusId(donation.id);
    go(isItem ? "track" : "history");
  };

  const createCampaign = async (payload) => {
    await api.createCampaign(payload);
    await loadPublicData();
    setNotification("Campaign created successfully!");
    go("campaigns");
  };

  const totalMoney = donations.reduce(
    (sum, donation) => sum + Number(donation.amount || 0),
    0
  );

  const completed = donations.filter((donation) => donation.status === "Delivered").length;

  const regions = useMemo(
    () => ["All Regions", ...Array.from(new Set(ngos.map((n) => n.city))).sort()],
    [ngos]
  );

  const filteredNGOs = useMemo(() => {
    const text = search.toLowerCase();

    return ngos.filter((ngo) => {
      const matchesText =
        ngo.name.toLowerCase().includes(text) ||
        ngo.city.toLowerCase().includes(text) ||
        ngo.address.toLowerCase().includes(text) ||
        ngo.categories.join(" ").toLowerCase().includes(text);

      const matchesCategory =
        categoryFilter === "All" || ngo.categories.includes(categoryFilter);

      const matchesRegion =
        regionFilter === "All Regions" || ngo.city === regionFilter;

      return matchesText && matchesCategory && matchesRegion;
    });
  }, [ngos, search, categoryFilter, regionFilter]);

  if (!authReady) {
    return <div className="app-loading">Loading KindConnect…</div>;
  }

  return (
    <div className="app">
      {notification && (
        <div className="toast">
          <span>✓</span>
          {notification}
        </div>
      )}

      <Navbar user={user} page={page} go={go} logout={logout} />

      {dataError && (
        <div className="server-banner" role="alert">
          <span>{dataError}</span>
          <button onClick={loadPublicData}>Retry</button>
        </div>
      )}

      <main>
        {page === "home" && <Home go={go} campaigns={campaigns} ngoCount={ngos.length} />}

        {page === "login" && <Login onLogin={login} go={go} />}

        {page === "register" && <Register onRegister={register} go={go} ngos={ngos} />}

        {page === "dashboard" && (
          <Dashboard
            user={user}
            donations={donations}
            totalMoney={totalMoney}
            completed={completed}
            go={go}
          />
        )}

        {page === "donateItems" && (
          <ItemDonation ngos={ngos} addDonation={addDonation} go={go} />
        )}

        {page === "donateMoney" && (
          <MoneyDonation campaigns={campaigns} addDonation={addDonation} go={go} />
        )}

        {page === "campaigns" && <Campaigns campaigns={campaigns} go={go} />}

        {page === "findNGOs" && (
          <FindNGOs
            ngos={filteredNGOs}
            totalCount={ngos.length}
            search={search}
            setSearch={setSearch}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            regionFilter={regionFilter}
            setRegionFilter={setRegionFilter}
            regions={regions}
            selectedNGO={selectedNGO}
            setSelectedNGO={setSelectedNGO}
            openGoogleMaps={openGoogleMaps}
            searchGoogleMaps={searchGoogleMaps}
            findNearbyNGOs={findNearbyNGOs}
            mapSearch={mapSearch}
            setMapSearch={setMapSearch}
            go={go}
          />
        )}

        {page === "history" && (
          <DonationHistory
            donations={donations}
            setSelectedDonation={setSelectedDonation}
            go={go}
            isNGO={user?.role === "NGO"}
          />
        )}

        {page === "track" && (
          <TrackDonation donations={donations} focusId={trackFocusId} />
        )}

        {page === "profile" && <Profile user={user} logout={logout} />}

        {page === "ngoDashboard" && (
          <NGODashboard donations={donations} go={go} />
        )}

        {page === "createCampaign" && (
          <CreateCampaign user={user} createCampaign={createCampaign} go={go} />
        )}
      </main>

      {selectedDonation && (
        <DonationModal
          donation={selectedDonation}
          close={() => setSelectedDonation(null)}
        />
      )}

      <Footer />
    </div>
  );
}

/* ---------------------------------------------------------
   NAVBAR
--------------------------------------------------------- */

function Navbar({ user, page, go, logout }) {
  const isNGO = user?.role === "NGO";
  const dashboardPage = isNGO ? "ngoDashboard" : "dashboard";

  return (
    <header className="navbar">
      <div className="brand" onClick={() => go("home")}>
        <div className="brand-mark">KC</div>
        <div>
          <strong>KindConnect</strong>
          <small>Donation &amp; Charity</small>
        </div>
      </div>

      <nav className="desktop-nav">
        <button className={page === "home" ? "active" : ""} onClick={() => go("home")}>
          Home
        </button>
        <button className={page === "campaigns" ? "active" : ""} onClick={() => go("campaigns")}>
          Campaigns
        </button>
        <button className={page === "findNGOs" ? "active" : ""} onClick={() => go("findNGOs")}>
          Find NGOs
        </button>

        {user ? (
          <>
            <button className={page === dashboardPage ? "active" : ""} onClick={() => go(dashboardPage)}>
              Dashboard
            </button>
            <button className={page === "history" ? "active" : ""} onClick={() => go("history")}>
              {isNGO ? "Donations" : "My Donations"}
            </button>
            <button className={page === "profile" ? "active" : ""} onClick={() => go("profile")}>
              Profile
            </button>
            <button className="nav-logout" onClick={logout}>
              Logout
            </button>
          </>
        ) : (
          <button className="nav-login" onClick={() => go("login")}>
            Login
          </button>
        )}
      </nav>
    </header>
  );
}

/* ---------------------------------------------------------
   HOME
--------------------------------------------------------- */

function Home({ go, campaigns, ngoCount }) {
  return (
    <>
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">Verified giving, tracked end to end</span>
          <h1>
            Every donation gets a number.
            <span> Every number tells you where it went.</span>
          </h1>
          <p>
            Donate money or essential items and follow the exact path it
            takes — matched to an NGO, picked up, and delivered — with a
            tracking ID for every contribution.
          </p>

          <div className="hero-actions">
            <button className="primary-btn" onClick={() => go("donateItems")}>
              Donate an item
            </button>
            <button className="secondary-btn" onClick={() => go("campaigns")}>
              Explore campaigns
            </button>
          </div>
        </div>

        <div className="hero-visual">
          <div className="receipt-card">
            <div className="receipt-notch top" />
            <div className="receipt-head">
              <span>KINDCONNECT RECEIPT</span>
              <strong>#DON-4471</strong>
            </div>
            <div className="receipt-line">
              <span>Item</span>
              <strong>School Books ×10</strong>
            </div>
            <div className="receipt-line">
              <span>Matched NGO</span>
              <strong>Children Education Fdn.</strong>
            </div>
            <div className="receipt-line">
              <span>Status</span>
              <strong className="receipt-status">In Transit</strong>
            </div>
            <div className="receipt-divider" />
            <div className="receipt-stages">
              {["Submitted", "Matched", "Pickup", "Transit", "Delivered"].map(
                (label, index) => (
                  <div
                    className={`receipt-stage ${index <= 3 ? "done" : ""}`}
                    key={label}
                  >
                    <span className="dot" />
                    {label}
                  </div>
                )
              )}
            </div>
            <div className="receipt-notch bottom" />
          </div>
        </div>
      </section>

      <section className="stats-section">
        <div>
          <strong>2,540+</strong>
          <span>People helped</span>
        </div>
        <div>
          <strong>8,420+</strong>
          <span>Items donated</span>
        </div>
        <div>
          <strong>₹18.5L+</strong>
          <span>Funds raised</span>
        </div>
        <div>
          <strong>{ngoCount}+</strong>
          <span>Verified NGOs</span>
        </div>
      </section>

      <section className="section">
        <SectionTitle
          eyebrow="Ways to help"
          title="Choose what you want to donate"
          subtitle="Your contribution can reach someone who needs it most."
        />

        <div className="category-grid">
          {[
            ["Clothes", "Donate clean clothes to families in need."],
            ["Books", "Give children the tools they need to learn."],
            ["Dry Food", "Help families with essential groceries."],
            ["Toys", "Bring a little joy into a child's day."],
            ["Healthcare", "Support healthcare and medical needs."],
            ["Money", "Fund a verified campaign directly."]
          ].map(([title, text]) => (
            <div className="category-card" key={title}>
              <div className="category-mark">{title.charAt(0)}</div>
              <h3>{title}</h3>
              <p>{text}</p>
              <button onClick={() => go(title === "Money" ? "donateMoney" : "donateItems")}>
                Donate this →
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="how-section">
        <SectionTitle
          eyebrow="How it works"
          title="Giving has never been easier"
          subtitle="From your doorstep to the person who needs it — tracked the whole way."
        />

        <div className="steps">
          {[
            ["Register", "Create your donor account in seconds."],
            ["Choose", "Select money or an item to donate."],
            ["Get matched", "We connect you with the right NGO."],
            ["Track", "Follow your donation until it's delivered."]
          ].map(([title, text], index) => (
            <div className="step" key={title}>
              <div className="step-index">{index + 1}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionTitle
          eyebrow="Featured"
          title="Campaigns making an impact"
          subtitle="Support causes that need your help today."
        />

        <div className="campaign-grid">
          {campaigns.slice(0, 3).map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} go={go} />
          ))}
        </div>
      </section>
    </>
  );
}

function SectionTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="section-title">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

/* ---------------------------------------------------------
   AUTH
--------------------------------------------------------- */

function Login({ onLogin, go }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Continue your journey of giving.">
      <form onSubmit={submit} className="auth-form">
        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />

        <label>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="primary-btn full" disabled={busy}>
          {busy ? "Logging in…" : "Login"}
        </button>

        <p className="auth-hint">
          New here?{" "}
          <button type="button" className="link-btn" onClick={() => go("register")}>
            Create an account
          </button>
        </p>

        <p className="auth-hint demo-accounts">
          Demo donor: donor@kindconnect.dev / Donor@123
          <br />
          Demo NGO: ngo@kindconnect.dev / Ngo@12345
        </p>
      </form>
    </AuthLayout>
  );
}

function Register({ onRegister, go, ngos }) {
  const [form, setForm] = useState({
    role: "Donor",
    name: "",
    email: "",
    phone: "",
    organization: "",
    password: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await onRegister({
        role: form.role,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        organization: form.role === "NGO" ? form.organization.trim() : undefined
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Join KindConnect" subtitle="Start making a difference today.">
      <form className="auth-form" onSubmit={submit}>
        <label>Account type</label>
        <div className="role-selector">
          <button type="button" className={form.role === "Donor" ? "selected" : ""} onClick={() => update("role", "Donor")}>
            Donor
          </button>
          <button type="button" className={form.role === "NGO" ? "selected" : ""} onClick={() => update("role", "NGO")}>
            NGO
          </button>
        </div>

        <label>Full name</label>
        <input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" required />

        <label>Email</label>
        <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@example.com" required />

        <label>Phone number</label>
        <input type="tel" value={form.phone} onChange={(e) => update("phone", e.target.value)} placeholder="+91 XXXXX XXXXX" required />

        {form.role === "NGO" && (
          <>
            <label>Your organisation</label>
            <input
              list="ngo-organisations"
              value={form.organization}
              onChange={(e) => update("organization", e.target.value)}
              placeholder="Pick from the list or type its name"
              required
            />
            <datalist id="ngo-organisations">
              {ngos.map((ngo) => (
                <option key={ngo.id} value={ngo.name} />
              ))}
            </datalist>
          </>
        )}

        <label>Password</label>
        <input
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          required
        />

        {error && <p className="form-error" role="alert">{error}</p>}

        <button className="primary-btn full" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>

        <p className="auth-hint">
          Already have an account?{" "}
          <button type="button" className="link-btn" onClick={() => go("login")}>
            Log in
          </button>
        </p>
      </form>
    </AuthLayout>
  );
}

function AuthLayout({ title, subtitle, children }) {
  return (
    <section className="auth-page">
      <div className="auth-decoration">
        <div className="auth-mark">KC</div>
        <h2>Give with confidence.</h2>
        <p>
          Connect with verified charities, donate what you can, and see the
          exact path your kindness takes.
        </p>
      </div>

      <div className="auth-card">
        <span className="eyebrow">KindConnect</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   DASHBOARD
--------------------------------------------------------- */

function Dashboard({ user, donations, totalMoney, completed, go }) {
  return (
    <section className="dashboard-page">
      <DashboardHeader
        title={`Hello, ${user?.name || "Donor"}`}
        subtitle="Here's an overview of your giving activity."
      />

      <div className="dashboard-stats">
        <StatCard value={`₹${totalMoney.toLocaleString("en-IN")}`} label="Money donated" />
        <StatCard value={donations.length} label="Total donations" />
        <StatCard value={completed} label="Delivered" />
        <StatCard value={donations.length - completed} label="In progress" />
      </div>

      <div className="quick-actions">
        <h2>Quick actions</h2>
        <div className="quick-grid">
          <button onClick={() => go("donateItems")}><span>Donate items</span></button>
          <button onClick={() => go("donateMoney")}><span>Donate money</span></button>
          <button onClick={() => go("findNGOs")}><span>Find NGOs</span></button>
          <button onClick={() => go("track")}><span>Track a donation</span></button>
        </div>
      </div>

      <div className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Recent activity</span>
            <h2>Your donations</h2>
          </div>
          <button onClick={() => go("history")}>View all →</button>
        </div>

        <DonationTable donations={donations.slice(0, 4)} />
      </div>
    </section>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------
   ITEM DONATION
--------------------------------------------------------- */

function ItemDonation({ ngos, addDonation, go }) {
  const [form, setForm] = useState({
    item: "",
    category: "Clothes",
    quantity: "1",
    condition: "Good",
    description: "",
    address: "",
    phone: "",
    ngo: ""
  });

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await addDonation({
        type: form.category,
        item: form.item,
        quantity: Number(form.quantity),
        condition: form.condition,
        description: form.description,
        pickupAddress: form.address,
        phone: form.phone,
        ngo: form.ngo // empty = "let us match me" (the server picks the NGO)
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="form-page">
      <DashboardHeader
        title="Donate items"
        subtitle="Give useful items a second life and help someone in need."
      />

      <div className="form-layout">
        <form className="large-form" onSubmit={submit}>
          <FormSection title="Donation details">
            <div className="form-grid">
              <Field label="Item name">
                <input
                  required
                  value={form.item}
                  onChange={(e) => update("item", e.target.value)}
                  placeholder="e.g. School books"
                />
              </Field>

              <Field label="Category">
                <select value={form.category} onChange={(e) => update("category", e.target.value)}>
                  <option>Clothes</option>
                  <option>Books</option>
                  <option>Dry Food</option>
                  <option>Toys</option>
                  <option>Healthcare</option>
                  <option>Other</option>
                </select>
              </Field>

              <Field label="Quantity">
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                />
              </Field>

              <Field label="Condition">
                <select value={form.condition} onChange={(e) => update("condition", e.target.value)}>
                  <option>New</option>
                  <option>Like New</option>
                  <option>Good</option>
                  <option>Used</option>
                </select>
              </Field>
            </div>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                placeholder="Describe your donation..."
              />
            </Field>
          </FormSection>

          <FormSection title="Pickup &amp; NGO">
            <Field label="Pickup address">
              <textarea
                required
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                placeholder="Enter pickup address"
              />
            </Field>

            <div className="form-grid">
              <Field label="Contact number">
                <input
                  required
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  placeholder="+91 XXXXX XXXXX"
                />
              </Field>

              <Field label="Preferred NGO">
                <select value={form.ngo} onChange={(e) => update("ngo", e.target.value)}>
                  <option value="">Let us match me</option>
                  {ngos.map((ngo) => (
                    <option key={ngo.id}>{ngo.name}</option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={() => go("dashboard")}>
              Cancel
            </button>
            <button className="primary-btn" disabled={busy}>
              {busy ? "Submitting…" : "Submit donation →"}
            </button>
          </div>
        </form>

        <div className="form-side-card">
          <span className="eyebrow light">After you submit</span>
          <h3>You'll get a tracking ID</h3>
          <p>
            Your item is matched with an NGO and moves through five tracked
            stages, right up to delivery.
          </p>

          <div className="side-list">
            <span>Matched with a verified NGO</span>
            <span>Pickup arranged at your address</span>
            <span>Live status on the tracking page</span>
            <span>Delivery confirmation with your ID</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function FormSection({ title, children }) {
  return (
    <div className="form-section">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------
   MONEY DONATION + PAYMENT
--------------------------------------------------------- */

function MoneyDonation({ campaigns, addDonation, go }) {
  const [amount, setAmount] = useState("500");
  const [campaignId, setCampaignId] = useState(null);
  const selectedCampaign = campaigns.find((c) => c.id === campaignId) || campaigns[0];
  const [anonymous, setAnonymous] = useState(false);
  const [method, setMethod] = useState("UPI");
  const [upiId, setUpiId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [bank, setBank] = useState("State Bank of India");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (processing || !selectedCampaign) return;

    setError("");
    setProcessing(true);

    // Short pause so the demo "payment" feels real.
    await new Promise((resolve) => setTimeout(resolve, 1400));

    try {
      // Only the payment METHOD is sent. Card number, CVV and UPI ID stay in the browser.
      await addDonation({
        type: "Money",
        campaignId: selectedCampaign.id,
        amount: Number(amount),
        paymentMethod: method,
        anonymous
      });
    } catch (err) {
      setError(err.message);
      setProcessing(false);
    }
  };

  const paymentIsValid = () => {
    if (method === "UPI") return upiId.trim().length > 3;
    if (method === "Card") return cardNumber.trim().length >= 12 && cardExpiry && cardCvv.length >= 3;
    return true;
  };

  return (
    <section className="form-page">
      <DashboardHeader title="Donate money" subtitle="Support a cause and help create measurable impact." />

      <div className="money-layout">
        <form className="large-form" onSubmit={submit}>
          <FormSection title="Choose amount">
            <div className="amount-grid">
              {["100", "500", "1000", "2500", "5000"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={amount === value ? "amount selected" : "amount"}
                  onClick={() => setAmount(value)}
                >
                  ₹{Number(value).toLocaleString("en-IN")}
                </button>
              ))}
            </div>

            <Field label="Custom amount">
              <div className="amount-input">
                <span>₹</span>
                <input type="number" min="10" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
            </Field>
          </FormSection>

          <FormSection title="Choose campaign">
            <Field label="Campaign">
              <select
                value={selectedCampaign?.id ?? ""}
                onChange={(e) => setCampaignId(Number(e.target.value))}
              >
                {campaigns.map((item) => (
                  <option key={item.id} value={item.id}>{item.title}</option>
                ))}
              </select>
            </Field>

            <label className="checkbox">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              Make this donation anonymous
            </label>
          </FormSection>

          <FormSection title="Payment method">
            <div className="method-selector">
              {["UPI", "Card", "Netbanking"].map((option) => (
                <button
                  type="button"
                  key={option}
                  className={method === option ? "method selected" : "method"}
                  onClick={() => setMethod(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            {method === "UPI" && (
              <Field label="UPI ID">
                <input
                  required
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="yourname@upi"
                />
              </Field>
            )}

            {method === "Card" && (
              <div className="form-grid">
                <Field label="Card number">
                  <input
                    required
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/[^\d]/g, "").slice(0, 16))}
                    placeholder="1234 5678 9012 3456"
                  />
                </Field>
                <Field label="Expiry">
                  <input
                    required
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(e.target.value)}
                    placeholder="MM/YY"
                  />
                </Field>
                <Field label="CVV">
                  <input
                    required
                    type="password"
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
                    placeholder="•••"
                  />
                </Field>
              </div>
            )}

            {method === "Netbanking" && (
              <Field label="Select bank">
                <select value={bank} onChange={(e) => setBank(e.target.value)}>
                  <option>State Bank of India</option>
                  <option>HDFC Bank</option>
                  <option>ICICI Bank</option>
                  <option>Axis Bank</option>
                  <option>Bank of Baroda</option>
                </select>
              </Field>
            )}

            <div className="demo-payment">
              <div>
                <strong>Secure demo payment</strong>
                <p>This college project simulates the payment process. No real money is charged.</p>
              </div>
            </div>
          </FormSection>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="form-actions">
            <button type="button" className="secondary-btn" onClick={() => go("campaigns")} disabled={processing}>
              Cancel
            </button>
            <button className="primary-btn" disabled={processing || !selectedCampaign || !paymentIsValid()}>
              {processing ? "Processing payment…" : `Donate ₹${Number(amount || 0).toLocaleString("en-IN")} →`}
            </button>
          </div>
        </form>

        <div className="impact-preview">
          <span className="eyebrow light">Your impact</span>
          <div className="impact-amount">₹{Number(amount || 0).toLocaleString("en-IN")}</div>
          <p>could help support a verified charity campaign.</p>
          <div className="mini-impact">
            <span>Campaign</span>
            <strong>{selectedCampaign?.title}</strong>
          </div>
          <div className="mini-impact">
            <span>Payment method</span>
            <strong>{method}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   CAMPAIGNS
--------------------------------------------------------- */

function Campaigns({ campaigns, go }) {
  return (
    <section className="section page-section">
      <SectionTitle
        eyebrow="Fundraising"
        title="Support a campaign"
        subtitle="Choose a verified cause and make a direct contribution."
      />

      <div className="campaign-grid">
        {campaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} go={go} large />
        ))}
      </div>
    </section>
  );
}

function CampaignCard({ campaign, go, large }) {
  const percentage = Math.min(100, Math.round((campaign.raised / campaign.target) * 100));

  return (
    <article className={large ? "campaign-card large" : "campaign-card"}>
      <div className="campaign-image">
        <span>{campaign.category.charAt(0)}</span>
        <b>{campaign.priority} priority</b>
      </div>

      <div className="campaign-content">
        <span className="category-label">{campaign.category}</span>
        <h3>{campaign.title}</h3>
        <p className="campaign-ngo">by {campaign.ngo}</p>
        <p>{campaign.description}</p>

        <div className="progress-info">
          <strong>₹{campaign.raised.toLocaleString("en-IN")}</strong>
          <span>of ₹{campaign.target.toLocaleString("en-IN")}</span>
        </div>

        <div className="progress">
          <span style={{ width: `${percentage}%` }}></span>
        </div>

        <div className="campaign-bottom">
          <span>{percentage}% funded</span>
          <button onClick={() => go("donateMoney")}>Donate →</button>
        </div>
      </div>
    </article>
  );
}

/* ---------------------------------------------------------
   FIND NGOs
--------------------------------------------------------- */

function FindNGOs({
  ngos,
  totalCount,
  search,
  setSearch,
  categoryFilter,
  setCategoryFilter,
  regionFilter,
  setRegionFilter,
  regions,
  selectedNGO,
  setSelectedNGO,
  openGoogleMaps,
  searchGoogleMaps,
  findNearbyNGOs,
  mapSearch,
  setMapSearch,
  go
}) {
  return (
    <section className="ngo-page">
      <div className="ngo-heading">
        <div>
          <span className="eyebrow">Location services</span>
          <h1>Find NGOs near you</h1>
          <p>
            Search {totalCount} verified NGOs across India, filter by what
            they need, and open their exact location in Google Maps.
          </p>
        </div>

        <button className="primary-btn" onClick={findNearbyNGOs}>
          Find NGOs near me
        </button>
      </div>

      <div className="map-search">
        <input
          value={mapSearch}
          onChange={(e) => setMapSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") searchGoogleMaps();
          }}
          placeholder="Search a category or NGO on Google Maps..."
        />
        <select value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
          {regions.map((region) => (
            <option key={region}>{region}</option>
          ))}
        </select>
        <button onClick={searchGoogleMaps}>Search Maps</button>
      </div>

      <div className="ngo-filters">
        <div className="search-box">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search NGO, city or donation category..."
          />
        </div>

        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option>All</option>
          <option>Clothes</option>
          <option>Books</option>
          <option>Dry Food</option>
          <option>Toys</option>
          <option>Healthcare</option>
        </select>
      </div>

      <div className="ngo-layout">
        <div className="ngo-list">
          <div className="list-header">
            <strong>{ngos.length} NGOs found</strong>
            <span>Verified organizations, {regionFilter}</span>
          </div>

          {ngos.map((ngo) => (
            <article
              className={`ngo-card ${selectedNGO?.id === ngo.id ? "selected" : ""}`}
              key={ngo.id}
              onClick={() => setSelectedNGO(ngo)}
            >
              <div className="ngo-card-top">
                <div className="ngo-mark">{ngo.name.charAt(0)}</div>
                <div>
                  <h3>{ngo.name}</h3>
                  {ngo.verified && <span className="verified">Verified NGO</span>}
                </div>
                <span className={`priority ${ngo.priority.toLowerCase()}`}>{ngo.priority}</span>
              </div>

              <p className="ngo-location">{ngo.address}</p>
              <p>{ngo.description}</p>

              <div className="tag-list">
                {ngo.categories.map((category) => (
                  <span key={category}>{category}</span>
                ))}
              </div>

              <div className="ngo-required">
                <strong>Currently needed:</strong> {ngo.requiredItems}
              </div>

              <div className="ngo-actions">
                <button
                  className="map-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    openGoogleMaps(ngo);
                  }}
                >
                  View on Google Maps
                </button>

                <button
                  className="donate-small"
                  onClick={(e) => {
                    e.stopPropagation();
                    go("donateItems");
                  }}
                >
                  Donate
                </button>
              </div>
            </article>
          ))}

          {ngos.length === 0 && (
            <div className="empty-state">
              <h3>No NGOs found</h3>
              <p>Try another search, category or region.</p>
            </div>
          )}
        </div>

        <div className="map-panel">
          <div className="map-placeholder">
            <div className="map-grid"></div>

            {ngos.map((ngo) => {
              const pos = pinPosition(ngo.id);
              return (
                <button
                  className={`map-pin ${selectedNGO?.id === ngo.id ? "active" : ""}`}
                  style={pos}
                  key={ngo.id}
                  onClick={() => setSelectedNGO(ngo)}
                  title={ngo.name}
                />
              );
            })}

            <div className="map-overlay-card">
              {selectedNGO ? (
                <>
                  <div className="mini-ngo">
                    <div className="ngo-mark">{selectedNGO.name.charAt(0)}</div>
                    <div>
                      <strong>{selectedNGO.name}</strong>
                      <span>{selectedNGO.city}</span>
                    </div>
                  </div>

                  <button className="primary-btn full" onClick={() => openGoogleMaps(selectedNGO)}>
                    Open exact location →
                  </button>
                </>
              ) : (
                <>
                  <h3>NGO location map</h3>
                  <p>Select an NGO or use the buttons above to open Google Maps.</p>
                </>
              )}
            </div>
          </div>

          <div className="map-note">
            <p>
              Map searches are scoped to <strong>{regionFilter}</strong> so
              results stay local instead of returning matches worldwide.
              "Near me" uses your device location.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   DONATION HISTORY / TABLE
--------------------------------------------------------- */

function DonationHistory({ donations, setSelectedDonation, go, isNGO }) {
  return (
    <section className="dashboard-page">
      <DashboardHeader title="Donation history" subtitle="View and manage all your previous donations." />

      <div className="dashboard-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">Your impact</span>
            <h2>All donations</h2>
          </div>

          {!isNGO && (
            <button className="primary-btn" onClick={() => go("donateItems")}>
              + New donation
            </button>
          )}
        </div>

        <DonationTable donations={donations} setSelectedDonation={setSelectedDonation} />
      </div>
    </section>
  );
}

function DonationTable({ donations, setSelectedDonation }) {
  return (
    <div className="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Donation ID</th>
            <th>Donation</th>
            <th>NGO</th>
            <th>Date</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {donations.map((donation) => {
            const status = donation.status;
            return (
              <tr key={donation.id}>
                <td><strong>{donation.id}</strong></td>
                <td>
                  <div className="table-donation">
                    <div>
                      <strong>{donation.item}</strong>
                      <small>
                        {donation.type === "Money"
                          ? `₹${Number(donation.amount).toLocaleString("en-IN")}`
                          : `Qty: ${donation.quantity}`}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{donation.ngo}</td>
                <td>{formatDate(donation.createdAt)}</td>
                <td>
                  <span className={`status ${statusClass(status)}`}>{status}</span>
                </td>
                <td>
                  {setSelectedDonation && (
                    <button className="details-btn" onClick={() => setSelectedDonation(donation)}>
                      Details
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------
   TRACK DONATION
--------------------------------------------------------- */

function TrackDonation({ donations, focusId }) {
  const [id, setId] = useState(focusId || "");
  const [activeId, setActiveId] = useState(focusId || "");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (focusId) {
      setId(focusId);
      setActiveId(focusId);
      setNotFound(false);
    }
  }, [focusId]);

  const searchDonation = (e) => {
    e.preventDefault();
    const found = donations.find((donation) => donation.id.toLowerCase() === id.trim().toLowerCase());
    setActiveId(found ? found.id : "");
    setNotFound(!found);
  };

  // Always read the latest copy from the list, so live status updates show up here too.
  const result = donations.find((donation) => donation.id === activeId) || null;
  const status = result?.status ?? null;
  const isMoney = result?.type === "Money";
  const stageIndex = !isMoney && status ? ITEM_STAGES.indexOf(status) : -1;

  return (
    <section className="track-page">
      <DashboardHeader
        title="Track your donation"
        subtitle="See exactly where your contribution is in the journey."
      />

      <form className="tracking-search" onSubmit={searchDonation}>
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="Enter donation ID, e.g. DON-1001"
        />
        <button className="primary-btn">Track donation</button>
      </form>

      {result ? (
        <div className="tracking-card">
          <div className="tracking-top">
            <div>
              <span className="eyebrow">Donation ID</span>
              <h2>{result.id}</h2>
              <p>{result.item} → {result.ngo}</p>
            </div>

            <span className={`status ${statusClass(status)}`}>{status}</span>
          </div>

          {isMoney ? (
            <div className="payment-receipt">
              <div>
                <span>Amount</span>
                <strong>₹{Number(result.amount).toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span>Payment method</span>
                <strong>{result.paymentMethod || "—"}</strong>
              </div>
              <div>
                <span>Donated on</span>
                <strong>{formatDate(result.createdAt)}</strong>
              </div>
              <p className="payment-note">
                Funds are released to the NGO once matched to a verified need,
                and usage is confirmed back to your donation ID.
              </p>
            </div>
          ) : (
            <>
              <div className="timeline">
                {ITEM_STAGES.map((label, index) => {
                  const active = index <= stageIndex;
                  return (
                    <div className={`timeline-item ${active ? "active" : ""}`} key={label}>
                      <div className="timeline-dot">{active ? "✓" : index + 1}</div>
                      <div>
                        <strong>{label}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>

              {status !== "Delivered" && (
                <div className="live-note">
                  <span className="live-dot" />
                  Live tracking — this status updates automatically as your
                  donation moves through each stage.
                </div>
              )}

              {status === "Delivered" && (
                <div className="delivery-message">
                  <div>
                    <strong>Donation successfully delivered!</strong>
                    <p>Thank you for helping make a positive difference.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="tracking-empty">
          <h2>{notFound ? "No donation found" : "Track your contribution"}</h2>
          <p>
            {notFound
              ? "Check the ID and try again - it looks like DON-1001."
              : "Enter a donation ID above to see its progress."}
          </p>
          <small>Try: {donations[0]?.id || "DON-1001"}</small>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------
   PROFILE
--------------------------------------------------------- */

function Profile({ user, logout }) {
  return (
    <section className="profile-page">
      <div className="profile-card">
        <div className="profile-avatar">{(user?.name || "D").charAt(0).toUpperCase()}</div>
        <span className="eyebrow">My profile</span>
        <h1>{user?.name || "Guest User"}</h1>
        <p>{user?.email || "guest@example.com"}</p>

        <div className="profile-info">
          <div>
            <span>Account type</span>
            <strong>{user?.role || "Donor"}</strong>
          </div>
          {user?.organization && (
            <div>
              <span>Organisation</span>
              <strong>{user.organization}</strong>
            </div>
          )}
          <div>
            <span>Verification</span>
            <strong>Verified</strong>
          </div>
        </div>

        <button className="secondary-btn" onClick={logout}>
          Logout
        </button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   NGO DASHBOARD
--------------------------------------------------------- */

function NGODashboard({ donations, go }) {
  const incoming = donations.filter((donation) => donation.status !== "Delivered");

  return (
    <section className="dashboard-page">
      <DashboardHeader title="NGO dashboard" subtitle="Manage donations and connect with generous donors." />

      <div className="dashboard-stats">
        <StatCard value={donations.length} label="Total donations" />
        <StatCard value={incoming.length} label="Incoming" />
        <StatCard value="98%" label="Delivery success" />
        <StatCard value="2,540" label="Lives helped" />
      </div>

      <div className="quick-actions">
        <h2>NGO actions</h2>
        <div className="quick-grid">
          <button onClick={() => go("findNGOs")}><span>Location directory</span></button>
          <button onClick={() => go("createCampaign")}><span>Create campaign</span></button>
          <button onClick={() => go("history")}><span>View donations</span></button>
          <button onClick={() => go("campaigns")}><span>My campaigns</span></button>
        </div>
      </div>
    </section>
  );
}

function CreateCampaign({ user, createCampaign, go }) {
  const [form, setForm] = useState({
    title: "",
    category: "Books",
    target: "",
    priority: "High",
    description: ""
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await createCampaign({ ...form, target: Number(form.target) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <section className="form-page">
      <DashboardHeader
        title="Create fundraising campaign"
        subtitle={`Tell donors how their support can help ${user?.organization || "your organisation"}.`}
      />

      <form className="large-form campaign-form" onSubmit={submit}>
        <FormSection title="Campaign information">
          <div className="form-grid">
            <Field label="Campaign title">
              <input
                required
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="e.g. Education for Every Child"
              />
            </Field>

            <Field label="Category">
              <select value={form.category} onChange={(e) => update("category", e.target.value)}>
                <option>Books</option>
                <option>Clothes</option>
                <option>Dry Food</option>
                <option>Healthcare</option>
                <option>Toys</option>
              </select>
            </Field>

            <Field label="Target amount">
              <input
                type="number"
                min="100"
                required
                value={form.target}
                onChange={(e) => update("target", e.target.value)}
                placeholder="100000"
              />
            </Field>

            <Field label="Priority">
              <select value={form.priority} onChange={(e) => update("priority", e.target.value)}>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </Field>
          </div>

          <Field label="Campaign description">
            <textarea
              required
              minLength={10}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Explain the purpose of your campaign..."
            />
          </Field>
        </FormSection>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          <button type="button" className="secondary-btn" onClick={() => go("ngoDashboard")}>
            Cancel
          </button>
          <button className="primary-btn" disabled={busy}>
            {busy ? "Creating…" : "Create campaign →"}
          </button>
        </div>
      </form>
    </section>
  );
}

function DashboardHeader({ title, subtitle }) {
  return (
    <div className="dashboard-header">
      <div>
        <span className="eyebrow">KindConnect</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function DonationModal({ donation, close }) {
  const status = donation.status;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={close}>×</button>
        <span className="eyebrow">Donation details</span>
        <h2>{donation.id}</h2>

        <div className="modal-details">
          <div>
            <span>Donation</span>
            <strong>{donation.item}</strong>
          </div>
          <div>
            <span>Type</span>
            <strong>{donation.type}</strong>
          </div>
          <div>
            <span>NGO</span>
            <strong>{donation.ngo}</strong>
          </div>
          <div>
            <span>Date</span>
            <strong>{formatDate(donation.createdAt)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          {donation.amount > 0 && (
            <div>
              <span>Amount</span>
              <strong>₹{Number(donation.amount).toLocaleString("en-IN")}</strong>
            </div>
          )}
        </div>

        <div className="transparency-box">
          <div>
            <strong>Transparency guarantee</strong>
            <p>Your donation is recorded with a unique ID and can be tracked through the application.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer>
      <div className="footer-brand">
        <div className="brand-mark">KC</div>
        <div>
          <strong>KindConnect</strong>
          <small>Donation &amp; Charity Management</small>
        </div>
      </div>

      <p>Making giving simpler, faster and more transparent.</p>

      <div className="footer-bottom">
        <span>© 2026 KindConnect. College Mini Project.</span>
        <span>Made for a better community.</span>
      </div>
    </footer>
  );
}

export default App;
