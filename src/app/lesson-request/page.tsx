"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import PageContainer from "@/components/PageContainer";

type Utms = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
};

type FormValues = {
  lessonLocation: string;
  lessonFor: string;
  lessonTimeline: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  zipCode: string;
};

const LESSON_LOCATIONS = [
  "Home Pool",
  "Condo/Public Pool (I have access)",
  "Open Water (Ocean)",
] as const;
const LESSON_FOR_OPTIONS = ["Adult", "Child"] as const;
const LESSON_TIMELINES = [
  "Within the Next 2 Weeks",
  "Within the Next Month",
  "This Spring/Summer",
  "Just Exploring Options",
] as const;

const STORAGE_KEY = "lead_utms_v1";
const MAX_AGE_DAYS = 30;
const ZIP_REGEX = /^\d{5}$/;
const PHONE_DIGITS_REQUIRED = 10;
const PHONE_REGEX = /^\d{10}$/;
const ZIP_DIGITS_REQUIRED = 5;

type ToastState = {
  message: string;
};

function readUtmsFromUrl(): Utms {
  const p = new URLSearchParams(window.location.search);
  const utms: Utms = {
    utm_source: p.get("utm_source") ?? undefined,
    utm_medium: p.get("utm_medium") ?? undefined,
    utm_campaign: p.get("utm_campaign") ?? undefined,
    utm_content: p.get("utm_content") ?? undefined,
  };

  (Object.keys(utms) as (keyof Utms)[]).forEach((k) => {
    if (!utms[k]) delete utms[k];
  });

  return utms;
}

function saveUtms(utms: Utms) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ utms, savedAt: Date.now() }));
}

function loadUtms(): Utms {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { utms: Utms; savedAt: number };
    const maxMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.savedAt > maxMs) return {};
    return parsed.utms ?? {};
  } catch {
    return {};
  }
}

function useAttribution() {
  const [utms, setUtms] = useState<Utms>({});
  const landingUrl = useMemo(
    () => (typeof window !== "undefined" ? window.location.href : ""),
    [],
  );

  useEffect(() => {
    const fromUrl = readUtmsFromUrl();
    const fromStore = loadUtms();
    const merged = { ...fromStore, ...fromUrl };
    setUtms(merged);
    if (Object.keys(merged).length) saveUtms(merged);
  }, []);

  return { utms, landingUrl };
}

function isValidPhone(value: string): boolean {
  return PHONE_REGEX.test(value);
}

function isValidZip(value: string): boolean {
  return ZIP_REGEX.test(value.trim());
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, "").slice(0, PHONE_DIGITS_REQUIRED);
}

function normalizeZipCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, ZIP_DIGITS_REQUIRED);
}

function formatPhoneNumber(value: string): string {
  const digits = normalizePhoneNumber(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

export default function LessonRequestPage() {
  const [values, setValues] = useState<FormValues>({
    lessonLocation: "",
    lessonFor: "",
    lessonTimeline: "",
    firstName: "",
    lastName: "",
    phoneNumber: "",
    zipCode: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { utms, landingUrl } = useAttribution();

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function onFieldChange<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onPhoneKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const allowedKeys = new Set([
      "Backspace",
      "Delete",
      "ArrowLeft",
      "ArrowRight",
      "Tab",
      "Home",
      "End",
    ]);

    if (allowedKeys.has(e.key) || e.ctrlKey || e.metaKey) return;
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
      return;
    }
    if (values.phoneNumber.length >= PHONE_DIGITS_REQUIRED) {
      e.preventDefault();
    }
  }

  function onPhonePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text");
    const nextValue = normalizePhoneNumber(values.phoneNumber + pasted);
    onFieldChange("phoneNumber", nextValue);
  }

  function validate(): string | null {
    if (!values.lessonLocation) return "Please select where you would like to take lessons.";
    if (!values.lessonFor) return "Please select who the lessons are for.";
    if (!values.lessonTimeline) return "Please select when you are looking to take lessons.";
    if (!values.firstName.trim()) return "First Name is required.";
    if (!values.lastName.trim()) return "Last Name is required.";
    if (!values.phoneNumber.trim()) return "Phone Number is required.";
    if (!isValidPhone(values.phoneNumber)) return "Phone Number must be exactly 10 digits with numbers only.";
    if (!values.zipCode.trim()) return "Zip Code is required.";
    if (!isValidZip(values.zipCode)) return "Please enter a valid ZIP code.";
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const validationError = validate();
    if (validationError) {
      setToast({ message: validationError });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          phoneNumber: values.phoneNumber.trim(),
          zipCode: values.zipCode.trim(),
          utms,
          landingUrl,
        }),
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Unable to submit your request right now.");
      }

      setIsSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit your request right now.";
      setToast({ message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageContainer>
      <section className="mx-auto max-w-3xl px-4 py-16 md:py-20">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900">
          Lesson Request
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-slate-700">
          Tell us what you are looking for and we will follow up with next steps.
        </p>

        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          {toast ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {toast.message}
            </div>
          ) : null}

          {isSuccess ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-900">You&apos;re all set!</h2>
              <p className="text-slate-700">
                We’ll follow up shortly to see if our program fits your schedule and needs.
              </p>
              <p className="text-slate-700">You successfully submitted your response</p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-8" noValidate>
              <fieldset disabled={isSubmitting}>
                <legend className="text-base font-semibold text-slate-900">
                  Where would you like to take lessons?
                </legend>
                <div className="mt-3 space-y-2">
                  {LESSON_LOCATIONS.map((option) => (
                    <label key={option} className="flex items-center gap-3 text-slate-700">
                      <input
                        type="radio"
                        name="lessonLocation"
                        value={option}
                        checked={values.lessonLocation === option}
                        onChange={(e) => onFieldChange("lessonLocation", e.target.value)}
                        className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset disabled={isSubmitting}>
                <legend className="text-base font-semibold text-slate-900">
                  Who are the lessons for?
                </legend>
                <div className="mt-3 space-y-2">
                  {LESSON_FOR_OPTIONS.map((option) => (
                    <label key={option} className="flex items-center gap-3 text-slate-700">
                      <input
                        type="radio"
                        name="lessonFor"
                        value={option}
                        checked={values.lessonFor === option}
                        onChange={(e) => onFieldChange("lessonFor", e.target.value)}
                        className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset disabled={isSubmitting}>
                <legend className="text-base font-semibold text-slate-900">
                  When are you looking into taking lessons?
                </legend>
                <div className="mt-3 space-y-2">
                  {LESSON_TIMELINES.map((option) => (
                    <label key={option} className="flex items-center gap-3 text-slate-700">
                      <input
                        type="radio"
                        name="lessonTimeline"
                        value={option}
                        checked={values.lessonTimeline === option}
                        onChange={(e) => onFieldChange("lessonTimeline", e.target.value)}
                        className="h-4 w-4 border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>{option}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset disabled={isSubmitting}>
                <legend className="text-base font-semibold text-slate-900">Contact Information</legend>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="text-sm text-slate-700">
                    First Name
                    <input
                      type="text"
                      value={values.firstName}
                      onChange={(e) => onFieldChange("firstName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    Last Name
                    <input
                      type="text"
                      value={values.lastName}
                      onChange={(e) => onFieldChange("lastName", e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    Phone Number
                    <input
                      type="text"
                      value={formatPhoneNumber(values.phoneNumber)}
                      onChange={(e) => onFieldChange("phoneNumber", normalizePhoneNumber(e.target.value))}
                      onKeyDown={onPhoneKeyDown}
                      onPaste={onPhonePaste}
                      inputMode="numeric"
                      autoComplete="tel-national"
                      maxLength={14}
                      placeholder="(123) 456 7890"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>

                  <label className="text-sm text-slate-700">
                    Zip Code
                    <input
                      type="text"
                      value={values.zipCode}
                      onChange={(e) => onFieldChange("zipCode", normalizeZipCode(e.target.value))}
                      inputMode="numeric"
                      maxLength={ZIP_DIGITS_REQUIRED}
                      placeholder="12345"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                    />
                  </label>
                </div>
              </fieldset>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-5 py-2.5 font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Submitting..." : "Submit Request"}
              </button>
            </form>
          )}
        </div>
      </section>
    </PageContainer>
  );
}
