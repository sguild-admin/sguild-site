"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronLeft, House, UserRound, Users, Waves } from "lucide-react";
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
  {
    value: "Home Pool",
    hint: "We come to your pool",
    icon: House,
  },
  {
    value: "Condo or Community Pool",
    hint: "Meet at your building or local pool",
    icon: Building2,
  },
  {
    value: "Ocean / Open Water",
    hint: "For ocean comfort or open water skills",
    icon: Waves,
  },
] as const;
const LESSON_FOR_OPTIONS = [
  {
    value: "Kids",
    hint: "Under 18",
    icon: Users,
  },
  {
    value: "Adults",
    hint: "18 & Older",
    icon: UserRound,
  },
] as const;
const LESSON_TIMELINES = [
  "Within the Next 2 Weeks",
  "Within the Next Month",
  "This summer",
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

type FieldKey = keyof FormValues;

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

function getChoiceCardClass(selected: boolean, minHeightClass: string): string {
  return [
    "group relative flex cursor-pointer items-center justify-center px-4 py-4 text-left rounded-2xl shadow-sm",
    "transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md",
    selected
      ? "border border-sky-200 ring-1 ring-sky-100 bg-sky-50/40 text-slate-900 scale-[1.01]"
      : "border border-[#E5E7EB] bg-white text-slate-700 hover:scale-[1.01]",
    minHeightClass,
  ].join(" ");
}

function getChoiceIconClass(selected: boolean): string {
  return [
    "flex h-10 w-10 shrink-0 items-center justify-center transition",
    selected
      ? "text-sky-700"
      : "text-slate-500 group-hover:text-slate-700",
  ].join(" ");
}

function scrollToSection(ref: RefObject<HTMLElement | null>) {
  ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LessonRequestPage() {
  const lessonLocationRef = useRef<HTMLFieldSetElement>(null);
  const lessonTimelineRef = useRef<HTMLFieldSetElement>(null);
  const contactRef = useRef<HTMLFieldSetElement>(null);
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
  const [touched, setTouched] = useState<Partial<Record<FieldKey, boolean>>>({});
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const { utms, landingUrl } = useAttribution();
  const progressWidth = `${(step / 3) * 100}%`;

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  function onFieldChange<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(key: FieldKey) {
    setTouched((prev) => ({ ...prev, [key]: true }));
  }

  function getFieldError(key: FieldKey): string | null {
    if (!touched[key]) return null;

    if (key === "firstName" || key === "lastName") {
      return values[key].trim() ? null : "Required field";
    }
    if (key === "phoneNumber") {
      if (!values.phoneNumber.trim()) return "Required field";
      return isValidPhone(values.phoneNumber) ? null : "Enter a valid phone number";
    }
    if (key === "zipCode") {
      if (!values.zipCode.trim()) return "Required field";
      return isValidZip(values.zipCode) ? null : "Required field";
    }

    return null;
  }

  function isContactSectionComplete(): boolean {
    return (
      Boolean(values.firstName.trim()) &&
      Boolean(values.lastName.trim()) &&
      isValidPhone(values.phoneNumber) &&
      isValidZip(values.zipCode)
    );
  }

  function isFormReady(): boolean {
    return (
      Boolean(values.lessonFor) &&
      Boolean(values.lessonLocation) &&
      Boolean(values.lessonTimeline) &&
      isContactSectionComplete()
    );
  }

  function selectLessonFor(value: string) {
    onFieldChange("lessonFor", value);
  }

  function selectLessonLocation(value: string) {
    onFieldChange("lessonLocation", value);
  }

  function continueToStepTwo() {
    if (!values.lessonFor || !values.lessonLocation) return;
    setStep(2);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function continueToStepThree() {
    if (!values.lessonTimeline) return;
    setStep(3);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function backToStepOne() {
    setStep(1);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function backToStepTwo() {
    setStep(2);
    window.scrollTo({ top: 0, behavior: "instant" });
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

    setTouched({
      firstName: true,
      lastName: true,
      phoneNumber: true,
      zipCode: true,
    });

    const validationError = validate();
    if (validationError) {
      setToast({ message: validationError });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/lead-intakes", {
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
    <PageContainer className="!bg-slate-100">
      <section className="mx-auto max-w-xl px-4 py-6 md:py-10">
        <div className="space-y-1">
          <h1 className="font-['Inter'] text-3xl font-extrabold tracking-tight text-slate-900 md:text-[2.1rem]">
            Request Lessons
          </h1>
          <p className="font-sf-pro text-sm text-slate-500">
            Tell us what you&apos;re looking for and we&apos;ll help you get started.
          </p>
        </div>

        <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          {toast ? (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {toast.message}
            </div>
          ) : null}

          {isSuccess ? (
            <div className="space-y-3">
              <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-800">
                Request received
              </p>
              <h2 className="text-2xl font-bold text-slate-900">You&apos;re all set!</h2>
              <p className="max-w-2xl font-sf-pro text-lg leading-relaxed text-slate-700">
                We&apos;ll reach out to coordinate scheduling and help you find the best fit for your first lesson.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-700">Step {step} of 3</p>
                  <p className="text-xs text-slate-400/80">Takes less than 30 seconds</p>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-[#1b80d0] to-[#1562bc] transition-all duration-300"
                    style={{ width: progressWidth }}
                  />
                </div>
              </div>

              {step === 1 ? (
                <div className="space-y-4">
                  <fieldset disabled={isSubmitting} className="space-y-4">
                    <legend className="text-base font-semibold tracking-tight text-slate-800">
                      Who are the lessons for?
                    </legend>
                    <div className="grid grid-cols-2 gap-3">
                      {LESSON_FOR_OPTIONS.map((option) => {
                        const selected = values.lessonFor === option.value;

                        return (
                          <label
                            key={option.value}
                            className={getChoiceCardClass(selected, "min-h-[96px]")}
                          >
                            <input
                              type="radio"
                              name="lessonFor"
                              value={option.value}
                              checked={selected}
                              onChange={() => selectLessonFor(option.value)}
                              className="sr-only"
                            />
                            <div className="flex w-full items-start gap-3">
                              <span className={getChoiceIconClass(selected)}>
                                <option.icon className="h-5 w-5" strokeWidth={2.25} />
                              </span>
                              <span className="space-y-1">
                                <span className="block text-[1.05rem] font-semibold tracking-tight text-slate-900">
                                  {option.value}
                                </span>
                                <span className="block max-w-[15rem] text-sm leading-5 text-slate-500">{option.hint}</span>
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset ref={lessonLocationRef} disabled={isSubmitting} className="space-y-4">
                    <legend className="text-base font-semibold tracking-tight text-slate-800">
                      Where will lessons take place?
                    </legend>
                    <div className="grid gap-3">
                      {LESSON_LOCATIONS.map((option) => {
                        const selected = values.lessonLocation === option.value;

                        return (
                          <label
                            key={option.value}
                            className={getChoiceCardClass(selected, "min-h-[80px]")}
                          >
                            <input
                              type="radio"
                              name="lessonLocation"
                              value={option.value}
                              checked={selected}
                              onChange={() => selectLessonLocation(option.value)}
                              className="sr-only"
                            />
                            <div className="flex w-full items-start gap-3">
                              <span className={getChoiceIconClass(selected)}>
                                <option.icon className="h-5 w-5" strokeWidth={2.25} />
                              </span>
                              <span className="space-y-1">
                                <span className="block text-[1.05rem] font-semibold tracking-tight text-slate-900">
                                  {option.value}
                                </span>
                                <span className="block max-w-[15rem] text-sm leading-5 text-slate-500">{option.hint}</span>
                              </span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={continueToStepTwo}
                      disabled={!values.lessonFor || !values.lessonLocation || isSubmitting}
                      className="inline-flex w-full items-center justify-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-3.5 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:from-[#1a75c0] hover:to-[#1358aa] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              ) : null}

              {step === 2 ? (
                <fieldset ref={lessonTimelineRef} disabled={isSubmitting}>
                  <div className="space-y-2">
                    <legend className="text-lg font-semibold tracking-tight text-slate-800">
                      When are you looking to start?
                    </legend>
                    <p className="font-sf-pro text-sm text-slate-400">
                      This helps us prioritize scheduling.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {LESSON_TIMELINES.map((option) => (
                      <label
                        key={option}
                        className={[
                          "flex cursor-pointer items-center rounded-2xl px-4 py-4 transition-all duration-150 ease-out shadow-sm hover:-translate-y-0.5 hover:shadow-md",
                          values.lessonTimeline === option
                            ? "border border-sky-200 ring-1 ring-sky-100 bg-sky-50/40 text-slate-900"
                            : "border border-[#E5E7EB] bg-white text-slate-700",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="lessonTimeline"
                          value={option}
                          checked={values.lessonTimeline === option}
                          onChange={(e) => onFieldChange("lessonTimeline", e.target.value)}
                          className="sr-only"
                        />
                        <span className="text-base">{option}</span>
                      </label>
                    ))}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={backToStepOne}
                      disabled={isSubmitting}
                      className="flex shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] px-3 py-2.5 text-slate-400 transition hover:bg-[#F1F5F9] hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={continueToStepThree}
                      disabled={!values.lessonTimeline || isSubmitting}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-3.5 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:from-[#1a75c0] hover:to-[#1358aa] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Continue
                    </button>
                  </div>
                </fieldset>
              ) : null}

              {step === 3 ? (
                <fieldset ref={contactRef} disabled={isSubmitting}>
                  <div className="space-y-2">
                    <legend className="text-lg font-semibold tracking-tight text-slate-800">
                      Check Availability
                    </legend>
                    <p className="max-w-2xl font-sf-pro text-sm text-slate-400">
                      We&apos;ll reach out to schedule your first lesson - no commitment required.
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm text-slate-700">
                        First Name
                        <input
                          type="text"
                          value={values.firstName}
                          onChange={(e) => onFieldChange("firstName", e.target.value)}
                          onBlur={() => markTouched("firstName")}
                          placeholder="e.g. Sarah"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                        {getFieldError("firstName") ? (
                          <span className="mt-1 block text-sm text-red-600">{getFieldError("firstName")}</span>
                        ) : null}
                      </label>

                      <label className="text-sm text-slate-500">
                        Last Name
                        <input
                          type="text"
                          value={values.lastName}
                          onChange={(e) => onFieldChange("lastName", e.target.value)}
                          onBlur={() => markTouched("lastName")}
                          placeholder="Optional"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                        />
                        {getFieldError("lastName") ? (
                          <span className="mt-1 block text-sm text-red-600">{getFieldError("lastName")}</span>
                        ) : null}
                      </label>
                    </div>

                    <label className="block text-sm text-slate-700">
                      Mobile Number
                      <input
                        type="text"
                        value={formatPhoneNumber(values.phoneNumber)}
                        onChange={(e) => onFieldChange("phoneNumber", normalizePhoneNumber(e.target.value))}
                        onBlur={() => markTouched("phoneNumber")}
                        onKeyDown={onPhoneKeyDown}
                        onPaste={onPhonePaste}
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={14}
                        placeholder="(808) 555-1234"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                      <span className="mt-1 block text-xs text-slate-400">
                        We&apos;ll text you to schedule your lesson.
                      </span>
                      {getFieldError("phoneNumber") ? (
                        <span className="mt-1 block text-sm text-red-600">{getFieldError("phoneNumber")}</span>
                      ) : null}
                    </label>

                    <label className="block text-sm text-slate-700">
                      Zip Code
                      <input
                        type="text"
                        value={values.zipCode}
                        onChange={(e) => onFieldChange("zipCode", normalizeZipCode(e.target.value))}
                        onBlur={() => markTouched("zipCode")}
                        inputMode="numeric"
                        maxLength={ZIP_DIGITS_REQUIRED}
                        placeholder="96816"
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
                      />
                      {getFieldError("zipCode") ? (
                        <span className="mt-1 block text-sm text-red-600">{getFieldError("zipCode")}</span>
                      ) : null}
                    </label>
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={backToStepTwo}
                      disabled={isSubmitting}
                      className="flex shrink-0 items-center justify-center rounded-lg bg-[#F8FAFC] px-3 py-2.5 text-slate-400 transition hover:bg-[#F1F5F9] hover:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="submit"
                      disabled={!isFormReady() || isSubmitting}
                      className="inline-flex flex-1 items-center justify-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-3.5 font-sf-pro text-[1rem] font-semibold text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:from-[#1a75c0] hover:to-[#1358aa] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? "Checking..." : "Check Availability"}
                    </button>
                  </div>
                </fieldset>
              ) : null}
            </form>
          )}
        </div>
      </section>
    </PageContainer>
  );
}

