"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";

// Documentation content imports
import { introductionContent } from "./content/introduction";
import { gettingStartedContent } from "./content/getting-started";
import { apiReferenceContent } from "./content/api-reference";
import { x402ProtocolContent } from "./content/x402-protocol";
import { elizaosContent } from "./content/integrations/elizaos";
import { daydreamsContent } from "./content/integrations/daydreams";
import { rigContent } from "./content/integrations/rig";
import { swarmsContent } from "./content/integrations/swarms";

interface NavItem {
  id: string;
  title: string;
}

const navigation: NavItem[] = [
  { id: "introduction", title: "Introduction" },
  { id: "getting-started", title: "Getting Started" },
  { id: "api-reference", title: "API Reference" },
  { id: "x402-protocol", title: "x402 Protocol" },
  { id: "elizaos", title: "ElizaOS" },
  { id: "daydreams", title: "Daydreams" },
  { id: "rig", title: "Rig (ARC)" },
  { id: "swarms", title: "Swarms" },
];

const contentMap: Record<string, { title: string; content: string }> = {
  introduction: introductionContent,
  "getting-started": gettingStartedContent,
  "api-reference": apiReferenceContent,
  "x402-protocol": x402ProtocolContent,
  elizaos: elizaosContent,
  daydreams: daydreamsContent,
  rig: rigContent,
  swarms: swarmsContent,
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4">
      <div className="absolute right-3 top-3 z-10">
        <button
          onClick={copyToClipboard}
          className="px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="absolute left-4 top-3 text-xs text-muted font-mono">
        {language}
      </div>
      <pre className="bg-[#0a0a0a] border border-white/5 text-white rounded-lg p-4 pt-10 overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      const language = line.slice(3).trim() || "text";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <CodeBlock key={key++} code={codeLines.join("\n")} language={language} />
      );
      i++;
      continue;
    }

    // Headers - bags.fm style
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={key++} className="text-2xl sm:text-3xl font-bold mt-8 mb-4 text-white">
          {line.slice(2)}
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="text-xl sm:text-2xl font-bold mt-10 mb-3 text-white">
          {line.slice(3)}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="text-lg font-semibold mt-6 mb-2 text-white">
          {line.slice(4)}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("#### ")) {
      elements.push(
        <h4 key={key++} className="text-base font-semibold mt-4 mb-2 text-white">
          {line.slice(5)}
        </h4>
      );
      i++;
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={key++} className="border-l-2 border-primary pl-4 my-4 text-muted-light italic">
          {line.slice(2)}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered lists
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].startsWith("- ") || lines[i].startsWith("* "))) {
        listItems.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-4 space-y-2">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-muted-light">
              <span className="text-primary mt-1.5">•</span>
              <span>{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered lists - bags.fm style with green circular step numbers
    if (/^\d+\.\s/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={key++} className="my-6 space-y-6">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-4">
              <span className="docs-step-number">{idx + 1}</span>
              <div className="flex-1 pt-0.5">
                <span className="text-muted-light">{renderInlineMarkdown(item)}</span>
              </div>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Tables
    if (line.includes("|") && line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length >= 2) {
        const headers = tableLines[0].split("|").filter(Boolean).map(h => h.trim());
        const rows = tableLines.slice(2).map(row => 
          row.split("|").filter(Boolean).map(cell => cell.trim())
        );
        elements.push(
          <div key={key++} className="my-4 overflow-x-auto">
            <table className="min-w-full border border-white/5 rounded-lg overflow-hidden">
              <thead className="bg-white/[0.02]">
                <tr>
                  {headers.map((header, idx) => (
                    <th key={idx} className="px-4 py-3 text-left text-xs font-semibold text-muted uppercase tracking-wider border-b border-white/5">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-white/5 last:border-0">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-4 py-3 text-sm text-muted-light">
                        {renderInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // Horizontal rule - bags.fm style divider
    if (line.trim() === "---" || line.trim() === "***") {
      elements.push(<hr key={key++} className="docs-divider" />);
      i++;
      continue;
    }

    // Empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Regular paragraphs
    elements.push(
      <p key={key++} className="my-3 text-muted-light leading-relaxed">
        {renderInlineMarkdown(line)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
}

function renderInlineMarkdown(text: string): React.ReactNode {
  // Handle inline code
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={idx} className="bg-white/5 text-primary px-1.5 py-0.5 rounded text-sm font-mono">
          {part.slice(1, -1)}
        </code>
      );
    }
    // Handle bold
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    return boldParts.map((boldPart, boldIdx) => {
      if (boldPart.startsWith("**") && boldPart.endsWith("**")) {
        return <strong key={`${idx}-${boldIdx}`} className="text-white">{boldPart.slice(2, -2)}</strong>;
      }
      // Handle italic
      const italicParts = boldPart.split(/(\*[^*]+\*)/g);
      return italicParts.map((italicPart, italicIdx) => {
        if (italicPart.startsWith("*") && italicPart.endsWith("*") && !italicPart.startsWith("**")) {
          return <em key={`${idx}-${boldIdx}-${italicIdx}`}>{italicPart.slice(1, -1)}</em>;
        }
        return italicPart;
      });
    });
  });
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("introduction");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentContent = contentMap[activeSection] || contentMap.introduction;

  // Check if this is a special/highlighted nav item
  const isSpecialNav = (id: string) => id === "swarms";

  return (
    <div className="min-h-screen bg-black flex flex-col">
      <main className="flex-1 pt-14">
        {/* Page Header - bags.fm style */}
        <div className="py-12 sm:py-16 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-3">
            How It Works
          </h1>
          <p className="text-lg text-muted-light">
            complete tasks, earn USDC, and stack bread.
          </p>
        </div>

        {/* Content Area */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex gap-6">
            {/* Sidebar Navigation - bags.fm style with dashed border */}
            <aside className="hidden lg:block w-56 shrink-0">
              <div className="sticky top-20 docs-card-sidebar">
                <nav className="flex flex-col">
                  {navigation.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={`docs-nav-item ${activeSection === item.id ? "active" : ""} ${isSpecialNav(item.id) ? "special" : ""}`}
                    >
                      {item.title}
                    </button>
                  ))}
                </nav>
              </div>
            </aside>

            {/* Mobile Navigation */}
            <div className="lg:hidden w-full mb-6">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="w-full flex items-center justify-between px-4 py-3 docs-card-sidebar text-white"
              >
                <span>{navigation.find(n => n.id === activeSection)?.title || "Select section"}</span>
                <svg
                  className={`w-5 h-5 transition-transform ${isMobileMenuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isMobileMenuOpen && (
                <div className="mt-2 docs-card-sidebar overflow-hidden">
                  {navigation.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveSection(item.id);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                        activeSection === item.id
                          ? "bg-primary text-black font-medium"
                          : "text-muted-light hover:bg-white/5"
                      }`}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Main Content - bags.fm style with dashed border */}
            <div className="flex-1 min-w-0">
              <div className="docs-card-content">
                <MarkdownRenderer content={currentContent.content} />

                {/* CTA Button at end of sections */}
                {activeSection === "introduction" && (
                  <div className="mt-8">
                    <Link href="/tasks">
                      <button className="btn-primary">
                        Browse Tasks
                      </button>
                    </Link>
                  </div>
                )}

                {activeSection === "getting-started" && (
                  <div className="mt-8">
                    <Link href="/tasks/create">
                      <button className="btn-primary">
                        Create a Task
                      </button>
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// Helper functions for navigation
const allSections = [
  "introduction",
  "getting-started",
  "api-reference",
  "x402-protocol",
  "elizaos",
  "daydreams",
  "rig",
  "swarms",
];

function getPrevSection(current: string): string | null {
  const idx = allSections.indexOf(current);
  return idx > 0 ? allSections[idx - 1] : null;
}

function getNextSection(current: string): string | null {
  const idx = allSections.indexOf(current);
  return idx < allSections.length - 1 ? allSections[idx + 1] : null;
}
