"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./SignalStory.module.css";

const chapters = [
  { label: "Choose your surface", word: "A place", title: "Your idea. In the picture.", copy: "Take the programme, the commercial break, or a panel beside the screen. Each surface has its own asking price.", detail: "Programme · Commercial · Display panels", href: "/airtime", cta: "Explore the surfaces" },
  { label: "Take the asking price", word: "A price", title: "Timing becomes your advantage.", copy: "The ask falls with time. Take the price you see and the station locks a quote for your creative. A higher bid takes over after the guaranteed runtime.", detail: "Descending ask · Locked quote · Guaranteed runtime", href: "#clock", cta: "Understand the auction" },
  { label: "Verify the payment", word: "A proof", title: "A signature. A verifiable record.", copy: "Your payment is bound to the surface and the creative’s hash. The station checks the on-chain event before putting your campaign on air.", detail: "Your wallet → Payment contract → Station verification", href: "#honesty", cta: "See what is verified" },
  { label: "Become the broadcast", word: "A signal", title: "From your wallet to the world.", copy: "Your creative runs on its surface until you are outbid, withdraw, or the station ends the run. An AirLog records the payment and the application’s delivery measurements separately.", detail: "On-air creative · Open-ended run · AirLog receipt", href: "/watch", cta: "Watch the station" },
];

/** An explanatory diagram, deliberately separate from live inventory and metrics. */
export function SignalStory() {
  const [active, setActive] = useState(0);
  const chapter = chapters[active];
  return (
    <section className={styles.section} aria-labelledby="signal-heading">
      <div className={styles.heading}>
        <div><p className={styles.eyebrow}>The mechanism / 01—04</p><h2 id="signal-heading">Attention has<br /><span>a new address.</span></h2></div>
        <p className={styles.intro}>One idea. A surface on the channel.<br />Follow the journey from creative to broadcast.</p>
      </div>
      <div className={styles.console}>
        <div className={styles.chapters} aria-label="Explore how airtime works">
          {chapters.map((item, i) => (
            <button key={item.label} className={styles.chapter} aria-pressed={active === i} aria-controls="signal-detail" onClick={() => setActive(i)}>
              <span className={styles.number}>0{i + 1}</span><span>{item.label}</span><span className={styles.arrow} aria-hidden>↗</span>
            </button>
          ))}
          <p className={styles.chapterNote}>Select a stage<br /><span>See how the network works.</span></p>
        </div>
        <div className={styles.display} data-stage={active}>
          <div className={styles.displayTop}><span>Signal architecture</span><span>Illustrated sequence / 0{active + 1}</span></div>
          <div className={styles.diagram} aria-hidden="true">
            <svg viewBox="0 0 700 260" fill="none">
              <defs><linearGradient id="signal-line"><stop stopColor="#ccff00" stopOpacity=".1" /><stop offset="1" stopColor="#ccff00" /></linearGradient></defs>
              <path d="M95 55H200L275 130H385M95 130H385M95 205H200L275 130" className={styles.routes} />
              <path d="M490 130H610" className={styles.routes} />
              {[55, 130, 205].map((y, i) => <g key={y}><rect x="50" y={y - 17} width="45" height="34" rx="3" className={styles.source} /><path d={`M60 ${y}h25`} stroke="currentColor" opacity=".5" /><text x="18" y={y + 4} className={styles.diagramLabel}>0{i + 1}</text></g>)}
              <circle cx="435" cy="130" r="79" className={styles.orbit} />
              <circle cx="435" cy="130" r="98" stroke="currentColor" strokeOpacity=".07" />
              <rect x="385" y="80" width="100" height="100" rx="6" className={styles.core} />
              <path d="M409 153l26-50 26 50M420 135h30" stroke="currentColor" strokeWidth="2" />
              <circle cx="622" cy="130" r="12" className={styles.destination} />
              <path d="M645 107a32 32 0 010 46m13-59a50 50 0 010 72" stroke="currentColor" strokeOpacity=".4" />
              <text x="435" y="245" textAnchor="middle" className={styles.diagramLabel}>AIRTIME / BROADCAST ENGINE</text>
            </svg>
            <span className={styles.diagramWord}>{chapter.word}</span>
          </div>
          <div id="signal-detail" className={styles.detail} aria-live="polite" aria-atomic="true">
            <div key={active} className={styles.detailContent}>
              <p className={styles.eyebrow}>{chapter.detail}</p>
              <h3>{chapter.title}</h3><p className={styles.copy}>{chapter.copy}</p>
              <Link href={chapter.href} className={styles.link}>{chapter.cta} <span aria-hidden>↗</span></Link>
            </div>
            <span className={styles.largeNumber} aria-hidden>0{active + 1}</span>
          </div>
        </div>
      </div>
      <div className={styles.footer}><span>Creative → Quote → Verification → Broadcast</span><span>Built on Robinhood Chain</span></div>
    </section>
  );
}
