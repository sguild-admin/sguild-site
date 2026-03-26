"use client";

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
  items: OfferingItem[];
  quote: ReactNode;
  subtext: ReactNode;
  author?: string;
  ctaLabel: string;
};

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
      "Gain confidence in deep water, improve safety awareness, and learn practical survival-focused movement.",
  },
  {
    title: "Stroke Development",
    body:
      "Improve stroke mechanics with targeted drills that increase control, comfort, and consistency.",
  },
  {
    title: "Efficiency & Endurance",
    body:
      "Train smarter with technique-first conditioning to swim farther with less effort and better breathing rhythm.",
  },
];

const infantOfferings: OfferingItem[] = [
  {
    title: "Water Comfort & Trust",
    body:
      "Gentle, play-based lessons that build comfort, trust, and positive association with the water.",
  },
  {
    title: "Early Safety Skills",
    body:
      "Age-appropriate safety habits and movement patterns to build awareness and confidence early.",
  },
  {
    title: "Parent-Involved Lessons",
    body:
      "Hands-on guidance for caregivers so progress continues between sessions with clear, simple routines.",
  },
];

export default function Offerings({
  title = "What we offer",
  titleSubline: _titleSubline,
  description = "All lessons are 30 minutes and take place at your home, condo, or an arranged location. Choose the option that best fits your swimmer's goals.",
  youthLabel = "For Kids",
}: OfferingsProps) {
  const groups = useMemo<OfferingGroupData[]>(
    () => [
      {
        key: "adults",
        heading: "Adults",
        items: adultOfferings,
        quote:
          "When I started swimming, I could barely make it across the pool. Two months later, I was swimming 400-500 yards a day.",
        subtext:
          "Being 42, I learned the skills to make swimming a lifetime sport. I'm very thankful for the instruction and highly recommend it.",
        author: "Will K",
        ctaLabel: "Book Adult Lessons Today",
      },
      {
        key: "youth",
        heading: youthLabel.replace(/^For\s+/i, ""),
        items: youthOfferings,
        quote: "Our son went from being a hesitant paddler to a full swimmer.",
        subtext:
          "We also appreciated the focus on form and technique, which helped him continue progressing.",
        author: "Blanca M",
        ctaLabel: "Book Child Lessons Today",
      },
      {
        key: "infants",
        heading: "Infants & Toddlers",
        items: infantOfferings,
        quote:
          "He worked with our 18-month-old granddaughter and was amazing with her, even when she wasn't happy that day.",
        subtext:
          "He kept engaging her, even singing to keep her involved. Over about 10 lessons, we saw real progress.",
        author: "Sarah N",
        ctaLabel: "Book Infant Lessons Today",
      },
    ],
    [youthLabel],
  );

  const [activeKey, setActiveKey] = useState<GroupKey>("adults");
  const activeGroup = groups.find((g) => g.key === activeKey) ?? groups[0];

  return (
    <section className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h2 className="text-2xl font-bold md:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-3xl text-sm text-slate-600">{description}</p>

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
                    onClick={() => setActiveKey(group.key)}
                    aria-expanded={isOpen}
                    className={`flex w-full items-center justify-between px-5 py-4 text-left text-slate-900 transition md:px-6 ${
                      isOpen
                        ? `bg-sky-50 ring-1 ring-inset ring-sky-100 ${isFirst ? "rounded-t-xl" : ""} ${
                            isLast ? "rounded-b-xl" : ""
                          }`
                        : "bg-white hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-lg font-bold text-slate-900 md:text-xl">{group.heading}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-5 md:px-6">
                      <div className="divide-y divide-slate-200/60">
                        {group.items.map((item) => (
                          <article key={`${group.key}-${item.title}`} className="py-4">
                            <h4 className="text-sm font-semibold text-slate-800">{item.title}</h4>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
                          </article>
                        ))}
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
            quote={activeGroup.quote}
            subtext={activeGroup.subtext}
            author={activeGroup.author}
            ctaLabel={activeGroup.ctaLabel}
            className="mt-2 md:mt-3 max-w-none"
          />
        </div>
      </div>

    </section>
  );
}
