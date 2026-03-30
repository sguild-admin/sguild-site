"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import TrustBlock from "./TrustBlock";

interface OfferingsProps {
  title?: string;
  titleSubline?: string;
  description?: string;
  youthLabel?: string;
}

type OfferingItem = {
  title: string;
  body: string;
};

type GroupKey = "adults" | "youth" | "infants";

type OfferingGroupData = {
  key: GroupKey;
  heading: string;
  subheading: string;
  items: OfferingItem[];
  quote: ReactNode;
  subtext: ReactNode;
  author?: string;
  ctaLabel: string;
};

const collapsedTrustState = {
  quote: "Quickly worked up a strategy and we saw a huge improvement in their skills.",
  subtext:
    "Lessons were tailored to each swimmer and pushed them forward at the right pace.",
  author: "Andrew F",
} as const;

const youthOfferings: OfferingItem[] = [
  {
    title: "Self Rescue & Water Safety",
    body:
      "Build calm, safe reactions in and around water with practical rescue-focused skills and safety habits.",
  },
  {
    title: "Private Skill Development",
    body:
      "Personalized coaching focused on technique, confidence, and steady progress based on each swimmer's level.",
  },
  {
    title: "Swim Team Prep",
    body:
      "Prepare for team practices with stronger fundamentals, cleaner stroke mechanics, and better pacing.",
  },
];

const adultOfferings: OfferingItem[] = [
  {
    title: "Water Confidence",
    body:
      "Build calm, capable movement in deep water with practical safety skills and real-world confidence.",
  },
  {
    title: "Stroke Development",
    body:
      "Dial in your stroke with precise technique work that enhances efficiency, control, and fluidity.",
  },
  {
    title: "Efficiency & Endurance",
    body:
      "Swim farther with less effort through technique-driven conditioning and improved breathing control.",
  },
];

const infantOfferings: OfferingItem[] = [
  {
    title: "Water Comfort & Trust",
    body:
      "Build comfort and trust in the water through calm, structured exposure and positive early experiences.",
  },
  {
    title: "Early Safety Skills",
    body:
      "Introduce foundational survival skills and movement patterns that build awareness and confidence from the start.",
  },
  {
    title: "Parent-Involved Lessons",
    body:
      "Hands-on instruction for parents to support safe practice and reinforce skills between lessons.",
  },
];

export default function Offerings({
  title = "What we offer",
  titleSubline: _titleSubline,
  description = "From beginners to advanced swimmers, each lesson is tailored to your goals and comfort and can be shared with others at no extra cost.",
  youthLabel = "For Kids",
}: OfferingsProps) {
  const groups = useMemo<OfferingGroupData[]>(
    () => [
      {
        key: "adults",
        heading: "Adults",
        subheading: "Confidence, technique, and endurance",
        items: adultOfferings,
        quote:
          "When I started swimming, I could barely make it across the pool. Two months later, I was swimming 400-500 yards a day.",
        subtext:
          "Being 42, I learned the skills to make swimming a lifetime sport. I'm very thankful for the instruction and highly recommend it.",
        author: "Will K",
        ctaLabel: "Start Your First Lesson",
      },
      {
        key: "youth",
        heading: youthLabel.replace(/^For\s+/i, ""),
        subheading: "Safety, skill development, and swim team prep",
        items: youthOfferings,
        quote: "Our son went from being a hesitant paddler to a full swimmer.",
        subtext:
          "We also appreciated the focus on form and technique, which helped him continue progressing.",
        author: "Blanca M",
        ctaLabel: "Book Your Child's First Lesson",
      },
      {
        key: "infants",
        heading: "Infants & Toddlers",
        subheading: "Early safety, control, and water comfort",
        items: infantOfferings,
        quote:
          "He worked with our 18-month-old granddaughter and was amazing with her, even when she wasn't happy that day.",
        subtext:
          "He kept engaging her, even singing to keep her involved. Over about 10 lessons, we saw real progress.",
        author: "Sarah N",
        ctaLabel: "Book Your Child's First Lesson",
      },
    ],
    [youthLabel],
  );

  const [activeKey, setActiveKey] = useState<GroupKey | null>(null);
  const activeGroup = groups.find((g) => g.key === activeKey) ?? null;
  const trustQuote = activeGroup?.quote ?? collapsedTrustState.quote;
  const trustSubtext = activeGroup?.subtext ?? collapsedTrustState.subtext;
  const trustAuthor = activeGroup?.author ?? collapsedTrustState.author;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h2 className="text-2xl font-bold md:text-3xl">
        {title}
      </h2>
      <p className="mt-2 font-sf-pro text-base text-slate-600 md:text-lg">{description}</p>

      <div className="mt-9 grid gap-8 md:grid-cols-12 md:items-start lg:gap-12">
        <div className="md:col-span-7">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_6px_16px_rgba(15,23,42,0.07)] divide-y divide-slate-200">
            {groups.map((group, index) => {
              const isOpen = group.key === activeKey;
              const isFirst = index === 0;
              const isLast = index === groups.length - 1;

              return (
                <div key={group.key}>
                  <button
                    type="button"
                    onClick={() => setActiveKey((current) => (current === group.key ? null : group.key))}
                    aria-expanded={isOpen}
                    className={`relative flex w-full items-center justify-between px-5 py-4 text-left text-slate-900 transition md:px-6 ${
                      isOpen
                        ? `bg-sky-50/40 ring-1 ring-inset ring-sky-100 ${isFirst ? "rounded-t-xl" : ""} ${
                            isLast ? "rounded-b-xl" : ""
                          }`
                        : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    {isOpen && (
                      <span
                        className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-sky-600"
                        aria-hidden="true"
                      />
                    )}
                    <span className={isOpen ? "flex min-h-[44px] items-center" : "block"}>
                      <span className={`text-lg text-slate-900 md:text-xl ${isOpen ? "font-bold" : "font-semibold"}`}>
                        {group.heading}
                      </span>
                      {!isOpen && (
                        <span className="mt-1 block text-base font-medium text-slate-500">
                          {group.subheading}
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-7 pt-4 md:px-6 md:pb-8">
                      <div className="space-y-5">
                        {group.items.map((item) => (
                          <article key={`${group.key}-${item.title}`} className="border-b border-slate-200/60 pb-5 last:border-b-0 last:pb-0">
                            <h4 className="text-base font-semibold text-slate-800 md:text-[1.05rem]">{item.title}</h4>
                            <p className="mt-2 text-base leading-7 text-slate-600">{item.body}</p>
                          </article>
                        ))}
                      </div>
                      <div className="mt-5 pt-5 pb-1">
                        <Link
                          href="/lesson-request"
                          className="inline-flex items-center justify-center rounded-xl bg-linear-to-b from-[#1b80d0] to-[#1562bc] px-4 py-2 font-sf-pro text-[1rem] font-medium text-white shadow-[0_2px_8px_rgba(27,128,208,0.18)] transition hover:brightness-95"
                        >
                          {group.ctaLabel}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-5">
          <TrustBlock
            quote={trustQuote}
            subtext={trustSubtext}
            author={trustAuthor}
            showCta={false}
            className="mt-2 md:mt-3 max-w-none"
          />
        </div>
      </div>
    </section>
  );
}
