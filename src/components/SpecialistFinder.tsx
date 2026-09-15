/**
 * LoopBreak — SpecialistFinder Component
 *
 * Displays after the shatter-and-reframe loop completes.
 * Fetches nearby mental health providers via Google Places API,
 * analyzes patient reviews with Gemini, and presents matched recommendations.
 *
 * Features:
 * - Browser geolocation with inline ZIP/Postal fallback
 * - Progressive loading status
 * - Provider cards with star ratings, modality tags, AI-synthesized review analysis
 * - Call / Website action buttons
 * - Crisis safety footer
 */

"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Phone,
  Globe,
  Star,
  Search,
  Loader2,
  Shield,
  ChevronDown,
  ChevronUp,
  Navigation,
  AlertTriangle,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────
interface TherapistMatch {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  address: string;
  phone: string;
  website: string;
  verifiedModalities: string[];
  reviewSynthesis: string;
  matchAppeal: string;
  sentimentScore: number;
  distance?: string;
}

interface SpecialistFinderProps {
  cognitiveSummary: string;
}

// ── Loading Steps ─────────────────────────────────────
const LOADING_STEPS = [
  "Scanning nearby clinics...",
  "Reading patient reviews...",
  "Matching clinical focus...",
  "Analyzing therapeutic fit...",
];

// ── Neubrutalist Star Rating ──────────────────────────
function StarRating({ rating, count }: { rating: number; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            className={`h-4 w-4 ${s <= Math.round(rating) ? "fill-[var(--color-yellow)] text-black" : "text-gray-300"}`}
            strokeWidth={2.5}
          />
        ))}
      </div>
      <span
        className="text-xs font-bold text-black"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {rating.toFixed(1)}
      </span>
      <span className="text-[10px] text-[var(--color-text-muted)]">
        ({count} reviews)
      </span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────
export default function SpecialistFinder({
  cognitiveSummary,
}: SpecialistFinderProps) {
  const [phase, setPhase] = useState<"idle" | "loading" | "results" | "error">(
    "idle"
  );
  const [providers, setProviders] = useState<TherapistMatch[]>([]);
  const [loadingStep, setLoadingStep] = useState(0);
  const [source, setSource] = useState("");
  const [warning, setWarning] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [expandedCard, setExpandedCard] = useState<string | null>(null);

  // ── Simulate progressive loading steps ───────────────
  const runLoadingSteps = useCallback(() => {
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < LOADING_STEPS.length) {
        setLoadingStep(step);
      } else {
        clearInterval(interval);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // ── Fetch providers from API ─────────────────────────
  const fetchProviders = useCallback(
    async (lat: number, lng: number, radiusKm?: number) => {
      setPhase("loading");
      setLoadingStep(0);
      setErrorMsg("");
      const clearSteps = runLoadingSteps();

      try {
        const res = await fetch("/api/match-therapists", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            radiusKm: radiusKm || 25,
            cognitiveSummary,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to fetch providers");
        }

        setProviders(data.providers || []);
        setSource(data.source || "");
        setWarning(data.warning || "");
        setPhase("results");
      } catch (err: any) {
        setErrorMsg(err.message || "Something went wrong. Please try again.");
        setPhase("error");
      } finally {
        clearSteps();
      }
    },
    [cognitiveSummary, runLoadingSteps]
  );

  // ── Geolocation handler ──────────────────────────────
  const handleGeolocate = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMsg("Geolocation is not supported by your browser.");
      setPhase("error");
      return;
    }

    setPhase("loading");
    setLoadingStep(0);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        fetchProviders(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        // Permission denied or unavailable — show ZIP fallback
        setPhase("idle");
        setErrorMsg(
          error.code === 1
            ? "Location permission denied. Enter your ZIP/Postal code below."
            : "Could not detect your location. Enter your ZIP/Postal code below."
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, [fetchProviders]);

  // ── Auto-trigger geolocation on mount ─────────────────
  useEffect(() => {
    // Small delay to let the component animate in
    const timer = setTimeout(() => {
      handleGeolocate();
    }, 800);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ZIP code fallback (approximate coords) ───────────
  const handleZipSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!zipCode.trim()) return;

      // Approximate geocoding via free API
      try {
        setPhase("loading");
        setLoadingStep(0);
        setErrorMsg("");

        const geoRes = await fetch(
          `https://api.zippopotam.us/us/${zipCode.trim()}`
        );
        if (!geoRes.ok) {
          // Try non-US (just use a rough approximation)
          throw new Error("ZIP code not found. Try a US ZIP code.");
        }
        const geoData = await geoRes.json();
        const lat = parseFloat(geoData.places?.[0]?.latitude || "40.7128");
        const lng = parseFloat(geoData.places?.[0]?.longitude || "-74.006");
        fetchProviders(lat, lng, 25);
      } catch {
        // If zip lookup fails, use generic US center and still call API
        fetchProviders(40.7128, -74.006, 50);
      }
    },
    [zipCode, fetchProviders]
  );

  // ── Render ───────────────────────────────────────────
  return (
    <div className="mt-8 mx-auto max-w-2xl px-6">
      {/* ── Prompt Card ──────────────────────────────── */}
      {phase === "idle" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="nb-card bg-white p-6 text-center"
        >
          <div className="mb-3 flex justify-center">
            <div className="nb-card bg-[var(--color-teal)] p-3">
              <Shield className="h-8 w-8 text-white" strokeWidth={2.5} />
            </div>
          </div>

          <h3
            className="text-lg font-bold text-black mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Ready for Deeper Support?
          </h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-5 max-w-sm mx-auto">
            Discover top-rated specialists nearby. We&apos;ll scan real patient
            reviews to find the best clinical match for your thought pattern.
          </p>

          {/* Scan Button */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={handleGeolocate}
            className="btn-primary flex items-center gap-2 mx-auto mb-4"
          >
            <Search className="h-4 w-4" strokeWidth={2.5} />
            Scan Nearby Specialists &amp; Reviews
          </motion.button>

          {/* ZIP Code Fallback */}
          <form onSubmit={handleZipSubmit} className="flex items-center gap-2 max-w-xs mx-auto">
            <div className="flex-1">
              <input
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                placeholder="or enter ZIP code"
                className="nb-input text-xs w-full"
                maxLength={10}
              />
            </div>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.96 }}
              className="btn-ghost text-xs px-3 py-2 flex items-center gap-1"
            >
              <Navigation className="h-3 w-3" />
              Go
            </motion.button>
          </form>

          {errorMsg && (
            <p className="mt-3 text-xs text-[var(--color-coral)] font-bold">
              {errorMsg}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Loading State ────────────────────────────── */}
      {phase === "loading" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="nb-card bg-white p-8 text-center"
        >
          <Loader2 className="h-10 w-10 text-[var(--color-teal)] animate-spin mx-auto mb-4" strokeWidth={2} />
          <p
            className="text-sm font-bold text-black"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {LOADING_STEPS[loadingStep] || LOADING_STEPS[0]}
          </p>
          <div className="mt-4 flex justify-center gap-1">
            {LOADING_STEPS.map((_, i) => (
              <div
                key={i}
                className="h-1.5 rounded-full transition-all duration-500"
                style={{
                  width: i <= loadingStep ? "24px" : "8px",
                  background:
                    i <= loadingStep
                      ? "var(--color-teal)"
                      : "var(--color-bg)",
                  border: "1px solid #000",
                }}
              />
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Error State ──────────────────────────────── */}
      {phase === "error" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="nb-card bg-white p-6 text-center"
        >
          <AlertTriangle className="h-8 w-8 text-[var(--color-coral)] mx-auto mb-3" strokeWidth={2.5} />
          <p className="text-sm font-bold text-black mb-3">{errorMsg}</p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => { setPhase("idle"); setErrorMsg(""); }}
            className="btn-ghost text-xs"
          >
            Try Again
          </motion.button>
        </motion.div>
      )}

      {/* ── Results ──────────────────────────────────── */}
      {phase === "results" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {warning && (
            <div className="nb-card bg-[var(--color-yellow)] p-3 text-xs font-bold text-black flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.5} />
              {warning}
            </div>
          )}

          {providers.length === 0 ? (
            <div className="nb-card bg-white p-6 text-center">
              <p className="text-sm text-[var(--color-text-muted)]">
                No providers found in your area. Try expanding your search radius or entering a nearby ZIP code.
              </p>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => setPhase("idle")}
                className="btn-ghost text-xs mt-3"
              >
                Search Again
              </motion.button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h3
                  className="text-sm font-bold text-black uppercase tracking-wider"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  Top Matches ({providers.length})
                </h3>
                {source === "mock" && (
                  <span className="text-[9px] bg-[var(--color-yellow)] border-2 border-black px-2 py-0.5 font-bold">
                    SAMPLE DATA
                  </span>
                )}
              </div>

              <AnimatePresence>
                {providers.map((provider, idx) => {
                  const isExpanded = expandedCard === provider.id;
                  return (
                    <motion.div
                      key={provider.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1, duration: 0.4 }}
                      className="nb-card bg-white overflow-hidden"
                    >
                      {/* Card Header */}
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="flex-1 min-w-0">
                            <h4
                              className="text-base font-bold text-black leading-tight mb-1"
                              style={{ fontFamily: "var(--font-display)" }}
                            >
                              {provider.name}
                            </h4>
                            <StarRating
                              rating={provider.rating}
                              count={provider.reviewCount}
                            />
                          </div>
                          {/* Sentiment Score Badge */}
                          <div
                            className="nb-card px-3 py-1.5 text-center shrink-0"
                            style={{
                              background:
                                provider.sentimentScore >= 85
                                  ? "var(--color-green)"
                                  : provider.sentimentScore >= 70
                                    ? "var(--color-yellow)"
                                    : "var(--color-bg)",
                            }}
                          >
                            <p
                              className="text-lg font-bold text-black leading-none"
                              style={{ fontFamily: "var(--font-mono)" }}
                            >
                              {provider.sentimentScore}
                            </p>
                            <p className="text-[8px] font-bold text-black/60 uppercase">
                              Fit
                            </p>
                          </div>
                        </div>

                        {/* Address + Distance */}
                        <div className="flex items-center gap-1.5 mb-3 text-xs text-[var(--color-text-muted)]">
                          <MapPin className="h-3 w-3 shrink-0" strokeWidth={2.5} />
                          <span>{provider.address}</span>
                          {provider.distance && (
                            <span className="font-bold text-black">
                              · {provider.distance}
                            </span>
                          )}
                        </div>

                        {/* Modality Tags */}
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {provider.verifiedModalities.map((mod) => (
                            <span
                              key={mod}
                              className="nb-badge text-[10px]"
                              style={{
                                background: "var(--color-teal)",
                                color: "#fff",
                              }}
                            >
                              {mod}
                            </span>
                          ))}
                        </div>

                        {/* Review Analysis Toggle */}
                        <button
                          onClick={() =>
                            setExpandedCard(isExpanded ? null : provider.id)
                          }
                          className="w-full flex items-center justify-between py-2 px-3 bg-[var(--color-bg)] border-2 border-black text-xs font-bold text-black hover:bg-[var(--color-yellow)] transition-colors"
                        >
                          <span style={{ fontFamily: "var(--font-mono)" }}>
                            Review Analysis
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
                          )}
                        </button>

                        {/* Expanded Review Analysis */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3 }}
                              className="overflow-hidden"
                            >
                              <div className="pt-3 space-y-3">
                                {/* Patient Consensus */}
                                <div>
                                  <p
                                    className="text-[10px] uppercase tracking-widest text-[var(--color-teal)] font-bold mb-1"
                                    style={{ fontFamily: "var(--font-mono)" }}
                                  >
                                    Patient Consensus
                                  </p>
                                  <p className="text-xs text-black leading-relaxed">
                                    {provider.reviewSynthesis}
                                  </p>
                                </div>

                                {/* Why This Match */}
                                <div className="bg-[var(--color-bg)] border-l-4 border-[var(--color-teal)] p-3">
                                  <p
                                    className="text-[10px] uppercase tracking-widest text-[var(--color-coral)] font-bold mb-1"
                                    style={{ fontFamily: "var(--font-mono)" }}
                                  >
                                    Why They Match Your Pattern
                                  </p>
                                  <p className="text-xs text-black leading-relaxed italic">
                                    {provider.matchAppeal}
                                  </p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex border-t-4 border-black">
                        {provider.phone && (
                          <a
                            href={`tel:${provider.phone}`}
                            className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold text-black bg-[var(--color-bg)] hover:bg-[var(--color-teal)] hover:text-white transition-colors border-r-2 border-black"
                            style={{ fontFamily: "var(--font-mono)" }}
                          >
                            <Phone className="h-3.5 w-3.5" strokeWidth={2.5} />
                            Call Clinic
                          </a>
                        )}
                        <a
                          href={
                            provider.website ||
                            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(provider.name + " " + provider.address)}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold text-black bg-[var(--color-bg)] hover:bg-[var(--color-yellow)] transition-colors"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          <Globe className="h-3.5 w-3.5" strokeWidth={2.5} />
                          Visit Website
                        </a>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </>
          )}

          {/* ── Safety Footer ─────────────────────────── */}
          <div className="nb-card bg-white p-4 text-center border-l-4 border-[var(--color-coral)]">
            <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
              <strong className="text-black">LoopBreak is not a medical provider.</strong>{" "}
              This tool offers peer-reviewed data for informational purposes only.
              If in crisis, call or text{" "}
              <a
                href="tel:988"
                className="font-bold text-[var(--color-teal)] underline"
              >
                988
              </a>{" "}
              (Suicide &amp; Crisis Lifeline).
            </p>
          </div>

          {/* ── Back Button ───────────────────────────── */}
          <div className="text-center pb-4">
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => setPhase("idle")}
              className="btn-ghost text-xs"
            >
              ← Back to Search
            </motion.button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
