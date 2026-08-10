import { useState } from "react";
import { API_URL } from "../lib/constants";
import type { Match } from "../lib/types";
import { apiFetch } from "../lib/utils";

type UseVisitModalParams = {
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  setError: (error: string | null) => void;
};

/** Owns the "mark as visited" modal — open/close state, form fields, and save. */
export function useVisitModal({ setMatches, setError }: UseVisitModalParams) {
  const [visitModal, setVisitModal] = useState<Match | null>(null);
  const [visitModalMode, setVisitModalMode] = useState<"add" | "view" | "edit">("add");
  const [visitExperience, setVisitExperience] = useState("");
  const [visitNotes, setVisitNotes] = useState("");

  const openVisitModal = (m: Match) => {
    setVisitModal(m);
    if (m.visitedAt) {
      setVisitModalMode("view");
      setVisitExperience(m.experience ?? "");
      setVisitNotes(m.notes ?? "");
    } else {
      setVisitModalMode("add");
      setVisitExperience("");
      setVisitNotes("");
    }
  };

  const closeVisitModal = () => {
    setVisitModal(null);
    setVisitModalMode("add");
    setVisitExperience("");
    setVisitNotes("");
  };

  const handleMarkVisited = async (swipeId: string, experience?: string, notes?: string) => {
    if (!swipeId) return;
    try {
      const res = await apiFetch(`${API_URL}/swipes/${swipeId}/visited`, {
        method: "PATCH",
        body: JSON.stringify({
          experience: experience?.trim() || undefined,
          notes: notes !== undefined ? (notes.trim() || undefined) : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMatches((prev) =>
          prev.map((m) =>
            m.swipeId === swipeId
              ? { ...m, visitedAt: data.visitedAt, experience: data.experience, notes: data.notes }
              : m
          )
        );
        closeVisitModal();
      } else {
        const err = await res.json();
        setError((err as { error?: string }).error || "Failed to mark as visited");
      }
    } catch {
      setError("Failed to mark as visited");
    }
  };

  return {
    visitModal,
    visitModalMode,
    setVisitModalMode,
    visitExperience,
    setVisitExperience,
    visitNotes,
    setVisitNotes,
    openVisitModal,
    closeVisitModal,
    handleMarkVisited,
  };
}
