"use client";

import React, { useState, useRef, useEffect } from "react";
import Image from "next/image";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function BreadAgent() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          history: messages,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.response },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "oops something went wrong ser. try again in a sec!",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <>
      {/* Floating Button - white bg with original logo */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-xl ${
          isOpen ? "rotate-90 scale-95" : ""
        }`}
        aria-label={isOpen ? "Close chat" : "Open Bread Agent chat"}
      >
        {isOpen ? (
          <svg
            className="w-6 h-6 text-black"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <Image
            src="/logo.png"
            alt="Bread Agent"
            width={36}
            height={36}
            className="rounded-full"
          />
        )}
      </button>

      {/* Chat Panel */}
      <div
        className={`fixed bottom-24 right-6 z-50 w-[360px] sm:w-[400px] bg-[#0a0a0a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${
          isOpen
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 translate-y-4 pointer-events-none"
        }`}
        style={{ maxHeight: "min(500px, calc(100vh - 150px))" }}
      >
        {/* Header */}
        <div className="bg-black/50 border-b border-white/5 px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Image
              src="/logo.png"
              alt=""
              width={24}
              height={24}
              className="rounded-full"
            />
          </div>
          <div className="flex-1">
            <h3 className="text-white font-medium text-sm">bread agent</h3>
            <p className="text-muted text-xs">ask me anything about bread</p>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-muted hover:text-white transition-colors p-1"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{ height: "350px" }}
        >
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              </div>
              <p className="text-white font-medium mb-1">gm fren!</p>
              <p className="text-muted text-sm">
                i&apos;m the bread agent. ask me anything about bread.markets -
                how to earn, submit tasks, connect wallet, whatever!
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {[
                  "how do i earn?",
                  "what is $BREAD?",
                  "how do tasks work?",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-muted-light transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-black rounded-br-md"
                      : "bg-white/5 text-white rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex gap-1">
                  <span
                    className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-2 h-2 bg-white/40 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-white/5 p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ask me anything..."
              disabled={isLoading}
              className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-muted focus:outline-none focus:border-primary/50 disabled:opacity-50 transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isLoading}
              className="w-10 h-10 bg-primary hover:bg-[#00e63e] disabled:bg-white/10 disabled:text-muted rounded-full flex items-center justify-center text-black transition-colors disabled:cursor-not-allowed"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
