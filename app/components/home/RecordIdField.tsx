"use client";

// Record-id field for the correction form (CEO 2026-08-12: "un campo di
// ricerca per id piuttosto che un menu a discesa").
//
// The related-record field used to be a native <select> fed with EVERY
// public record (~37k <option>): the page walked the whole dataset and
// the browser froze when the menu opened. This field is a plain text
// input for the RECORD ID: it validates a numeric id, resolves it through
// GET /api/cameras/[id] and shows a confirmation line (or a gentle
// not-found message). No dropdown, no option list — a single cheap
// request per id.
//
// The chosen record lands in a hidden input so the enclosing form submits
// the exact same `cameraId` contract as the old select (empty string = no
// specific record / general concern). Empty input stays a valid
// submission, exactly like the select's empty option.

import { useCallback, useEffect, useRef, useState } from "react";

const RESOLVE_DEBOUNCE_MS = 300;

export type RecordIdFieldCopy = {
  label: string;
  placeholder: string;
  help: string;
  notFound: (id: number) => string;
  unavailable: string;
  clear: string;
};

type Props = {
  inputId: string;
  /** Hidden input `name` (the form submits this as `cameraId`). */
  name: string;
  copy: RecordIdFieldCopy;
  /** ?record=ID prefill: the record is resolved by id on mount. */
  initialRecordId?: number | null;
  /** Called when a record is confirmed (aria-live announcement). */
  onConfirmed?: (id: number, title: string) => void;
};

export function RecordIdField({ inputId, name, copy, initialRecordId = null, onConfirmed }: Props) {
  const [draft, setDraft] = useState(initialRecordId != null ? String(initialRecordId) : "");
  // The prefill starts in "checking" (no synchronous setState inside the
  // mount effect — react-hooks set-state-in-effect).
  const [status, setStatus] = useState<"idle" | "checking" | "found" | "not-found" | "error">(
    initialRecordId != null ? "checking" : "idle",
  );
  const [confirmed, setConfirmed] = useState<{ id: number; title: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const resolveId = useCallback(
    (id: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      fetch(`/api/cameras/${id}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) {
            setStatus("not-found");
            setConfirmed(null);
            return;
          }
          const payload = (await response.json()) as { record?: { id: number; title: string } | null };
          const record = payload.record;
          if (!record || record.id !== id) {
            setStatus("not-found");
            setConfirmed(null);
            return;
          }
          setConfirmed({ id: record.id, title: record.title });
          setStatus("found");
          onConfirmed?.(record.id, record.title);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setStatus("error");
          setConfirmed(null);
        });
    },
    [onConfirmed],
  );

  // ?record=ID prefill: resolve once on mount (the draft already carries
  // the id so the field shows it immediately).
  useEffect(() => {
    if (initialRecordId == null) return;
    resolveId(initialRecordId);
  }, [initialRecordId, resolveId]);

  // Unmount: cancel the debounce and any in-flight request.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, []);

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
      const id = value.trim();
      if (!/^\d+$/.test(id)) {
        setStatus("idle");
        setConfirmed(null);
        return;
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setStatus("checking");
        resolveId(Number(id));
      }, RESOLVE_DEBOUNCE_MS);
    },
    [resolveId],
  );

  const clearSelection = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    controllerRef.current?.abort();
    setDraft("");
    setStatus("idle");
    setConfirmed(null);
  }, []);

  return (
    <div className="record-id-field">
      <label htmlFor={inputId}>{copy.label}</label>
      <input
        id={inputId}
        type="search"
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        placeholder={copy.placeholder}
        aria-describedby={`${inputId}-help`}
        aria-busy={status === "checking" || undefined}
      />
      <input type="hidden" name={name} value={confirmed ? String(confirmed.id) : ""} />
      <p id={`${inputId}-help`} className="sr-only">
        {copy.help}
      </p>
      {status === "checking" && <p className="record-id-status" role="status">…</p>}
      {status === "found" && confirmed && (
        <p className="record-id-status record-id-status--found" role="status">
          ✓ Record {confirmed.id} — {confirmed.title}
        </p>
      )}
      {status === "not-found" && (
        <p className="record-id-status record-id-status--error" role="status">
          {copy.notFound(Number(draft))}
        </p>
      )}
      {status === "error" && (
        <p className="record-id-status record-id-status--error" role="status">
          {copy.unavailable}
        </p>
      )}
      {confirmed && (
        <button type="button" className="record-id-clear" onClick={clearSelection}>
          {copy.clear}
        </button>
      )}
    </div>
  );
}
