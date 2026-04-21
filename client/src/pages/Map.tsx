import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Link, useSearchParams } from "react-router-dom";
import { api, type SportEntry, type Venue } from "../api.js";
import { SportIcon } from "../components/SportIcon.js";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
      maxzoom: 19,
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

type Tab = "venues" | "sports";

export default function MapPage() {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const [venues, setVenues] = useState<Venue[]>([]);
  const [sports, setSports] = useState<SportEntry[]>([]);
  const [tab, setTab] = useState<Tab>("venues");
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [selectedSport, setSelectedSport] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [params] = useSearchParams();

  useEffect(() => {
    api.venues().then(setVenues).catch(() => {});
    api.sports().then(setSports).catch(() => {});
  }, []);

  useEffect(() => {
    const s = params.get("sport");
    if (s) { setTab("sports"); setSelectedSport(s); }
    const v = params.get("venue");
    if (v) { setTab("venues"); setSelectedVenue(v); }
  }, [params]);

  // Init map once.
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: el.current,
      style: OSM_STYLE,
      center: [-118.32, 34.02],
      zoom: 9.3,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Filter logic
  const venuesWithCoords = useMemo(
    () => venues.filter((v) => v.lat != null && v.lng != null),
    [venues]
  );

  const activeVenueNames = useMemo(() => {
    if (tab === "sports" && selectedSport) {
      return new Set(
        venues.filter((v) => v.sports.includes(selectedSport)).map((v) => v.name)
      );
    }
    if (tab === "venues" && selectedVenue) return new Set([selectedVenue]);
    return null;
  }, [tab, selectedSport, selectedVenue, venues]);

  // Render markers reactively.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || venuesWithCoords.length === 0) return;

    // Remove old markers we don't need.
    for (const [name, m] of markersRef.current) {
      if (!venuesWithCoords.find((v) => v.name === name)) {
        m.remove();
        markersRef.current.delete(name);
      }
    }

    for (const v of venuesWithCoords) {
      const isActive = activeVenueNames ? activeVenueNames.has(v.name) : true;
      const isSelected = selectedVenue === v.name;
      const existing = markersRef.current.get(v.name);

      const node = existing?.getElement() ?? document.createElement("button");
      node.className =
        "rounded-full border-2 border-white shadow-md cursor-pointer transition-all duration-200 ease-out " +
        (isSelected
          ? "bg-ink w-7 h-7 scale-125"
          : isActive
          ? "bg-accent w-5 h-5 hover:scale-125"
          : "bg-black/20 w-3 h-3 opacity-40");
      node.title = v.name;
      node.onclick = () => {
        setTab("venues");
        setSelectedVenue(v.name);
        setSelectedSport(null);
        map.flyTo({ center: [v.lng!, v.lat!], zoom: 13, duration: 700 });
      };

      if (!existing) {
        const marker = new maplibregl.Marker({ element: node })
          .setLngLat([v.lng!, v.lat!])
          .addTo(map);
        markersRef.current.set(v.name, marker);
      }
    }
  }, [venuesWithCoords, activeVenueNames, selectedVenue]);

  // Fit bounds to active venues when sport changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeVenueNames) return;
    const points = venuesWithCoords.filter((v) => activeVenueNames.has(v.name));
    if (points.length === 0) return;
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng!, points[0].lat!], zoom: 13, duration: 700 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    points.forEach((p) => bounds.extend([p.lng!, p.lat!]));
    map.fitBounds(bounds, { padding: 80, duration: 700, maxZoom: 12 });
  }, [activeVenueNames, venuesWithCoords]);

  const selVenue = selectedVenue ? venues.find((v) => v.name === selectedVenue) : null;

  const filteredVenues = useMemo(
    () =>
      venues.filter((v) => !filter || v.name.toLowerCase().includes(filter.toLowerCase())),
    [venues, filter]
  );
  const filteredSports = useMemo(
    () =>
      sports.filter((s) => !filter || s.sport.toLowerCase().includes(filter.toLowerCase())),
    [sports, filter]
  );

  return (
    <div className="grid md:grid-cols-[1fr_22rem] gap-4 h-[calc(100vh-8rem)]">
      <div ref={el} className="rounded-2xl overflow-hidden border border-black/5 min-h-[24rem]" />

      <aside className="card !p-0 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-black/5">
          <div className="flex gap-1 bg-black/5 rounded-xl p-1">
            {(["venues", "sports"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "flex-1 py-1.5 text-sm font-medium rounded-lg transition " +
                  (tab === t ? "bg-white shadow-sm" : "text-black/60 hover:text-black")
                }
              >
                By {t === "venues" ? "Venue" : "Sport"}
              </button>
            ))}
          </div>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={tab === "venues" ? "Search venues…" : "Search sports…"}
            className="mt-2 w-full rounded-lg border border-black/10 px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {selVenue ? (
            <div className="p-4 space-y-3">
              <button className="btn-ghost" onClick={() => setSelectedVenue(null)}>← All venues</button>
              <div>
                <h3 className="text-lg font-bold">{selVenue.name}</h3>
                <div className="text-sm text-black/60">
                  {selVenue.city ?? selVenue.zone ?? "—"}
                  {selVenue.lat == null && <span className="ml-1 text-amber-600">· no map pin</span>}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-xs">
                  <span className="chip">{selVenue.sessions} sessions</span>
                  {selVenue.medals > 0 && <span className="chip bg-gold/20 text-gold">🏅 {selVenue.medals}</span>}
                  {selVenue.zone && <span className="chip">{selVenue.zone}</span>}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase text-black/50 mb-1">Sports</div>
                <div className="flex flex-wrap gap-1.5">
                  {selVenue.sports.map((s) => (
                    <Link
                      key={s}
                      to={`/schedule?venue=${encodeURIComponent(selVenue.name)}&sport=${encodeURIComponent(s)}`}
                      className="inline-flex items-center gap-1 chip hover:bg-ink hover:text-white transition"
                    >
                      <SportIcon sport={s} size={14} />
                      {s}
                    </Link>
                  ))}
                </div>
              </div>
              <Link to={`/schedule?venue=${encodeURIComponent(selVenue.name)}`} className="btn w-full justify-center">
                View all sessions →
              </Link>
            </div>
          ) : tab === "venues" ? (
            <div className="divide-y divide-black/5">
              {filteredVenues.map((v) => (
                <button
                  key={v.slug}
                  onClick={() => { setSelectedVenue(v.name); setSelectedSport(null); }}
                  className="w-full text-left px-4 py-2.5 hover:bg-black/5 transition"
                >
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    <span className={"inline-block w-2 h-2 rounded-full " + (v.lat != null ? "bg-accent" : "bg-black/20")} />
                    {v.name}
                  </div>
                  <div className="text-xs text-black/50 flex gap-2">
                    <span>{v.sessions} sessions</span>
                    {v.medals > 0 && <span className="text-gold">🏅 {v.medals}</span>}
                    {v.zone && <span>· {v.zone}</span>}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {filteredSports.map((s) => {
                const active = selectedSport === s.sport;
                const vCount = venues.filter((v) => v.sports.includes(s.sport)).length;
                return (
                  <button
                    key={s.sport}
                    onClick={() => { setSelectedSport(active ? null : s.sport); setSelectedVenue(null); }}
                    className={
                      "w-full text-left px-4 py-2.5 flex items-center gap-3 transition " +
                      (active ? "bg-ink text-white" : "hover:bg-black/5")
                    }
                  >
                    <SportIcon sport={s.sport} size={22} className={active ? "text-accent" : "text-ink"} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.sport}</div>
                      <div className={"text-xs " + (active ? "text-white/60" : "text-black/50")}>
                        {s.count} sessions · {vCount} venue{vCount === 1 ? "" : "s"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {tab === "sports" && selectedSport && (
          <div className="p-3 border-t border-black/5 bg-white/80 backdrop-blur">
            <div className="text-xs text-black/50 mb-1">Showing venues for</div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <SportIcon sport={selectedSport} size={18} />
              {selectedSport}
            </div>
            <Link
              to={`/schedule?sport=${encodeURIComponent(selectedSport)}`}
              className="btn w-full justify-center mt-2"
            >
              View schedule →
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
