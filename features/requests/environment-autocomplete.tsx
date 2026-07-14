"use client";

import { Braces } from "lucide-react";
import { KeyboardEvent, useRef, useState } from "react";

import type { EnvironmentVariable } from "@/features/workspaces/workspace-client";

type Props = {
  value: string;
  onChange: (value: string) => void;
  variables: EnvironmentVariable[];
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
  multiline?: boolean;
  highlightVariables?: boolean;
};

export function EnvironmentAutocomplete({
  value,
  onChange,
  variables,
  placeholder,
  className,
  id,
  ariaLabel,
  multiline = false,
  highlightVariables = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [token, setToken] = useState<{
    start: number;
    end: number;
    query: string;
  } | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = token
    ? variables
        .filter((item) =>
          item.key.toLowerCase().includes(token.query.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  function inspect(element: HTMLInputElement | HTMLTextAreaElement) {
    const caret = element.selectionStart ?? element.value.length;
    const match = element.value.slice(0, caret).match(/\{\{?([A-Za-z0-9_]*)$/);
    const closingLength = element.value.slice(caret).startsWith("}}") ? 2 : 0;
    setToken(
      match
        ? {
            start: caret - match[0].length,
            end: caret + closingLength,
            query: match[1],
          }
        : null,
    );
    setActive(0);
  }

  function choose(key: string) {
    if (!token) return;
    const insertion = `{{${key}}}`;
    const next =
      value.slice(0, token.start) + insertion + value.slice(token.end);
    const caret = token.start + insertion.length;
    onChange(next);
    setToken(null);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(caret, caret);
    }, 0);
  }

  function keyDown(
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    if (event.ctrlKey && event.key === " ") {
      event.preventDefault();
      const caret = event.currentTarget.selectionStart ?? value.length;
      setToken({ start: caret, end: caret, query: "" });
      setActive(0);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(
        (index) => (index - 1 + suggestions.length) % suggestions.length,
      );
    }
    if (event.key === "Enter" && (!multiline || token)) {
      event.preventDefault();
      choose(suggestions[active]?.key ?? suggestions[0].key);
    }
    if (event.key === "Escape") setToken(null);
  }

  const shared = {
    value,
    placeholder,
    className: `${className ?? ""} ${highlightVariables ? "relative z-10" : ""}`,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      onChange(event.target.value);
      inspect(event.target);
    },
    onClick: (
      event: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => inspect(event.currentTarget),
    onFocus: (
      event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => inspect(event.currentTarget),
    onKeyUp: (
      event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (event.ctrlKey && event.key === " ") return;
      if (!["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key))
        inspect(event.currentTarget);
    },
    onKeyDown: keyDown,
    onBlur: () => window.setTimeout(() => setToken(null), 120),
  };

  return (
    <div
      className={`relative min-w-0 ${highlightVariables ? "rounded-lg bg-[#1b112c]" : ""}`}
    >
      {highlightVariables && !multiline && value ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-3 font-mono text-xs whitespace-pre"
        >
          <HighlightedValue value={value} />
        </div>
      ) : null}
      {multiline ? (
        <textarea
          ref={(node) => {
            inputRef.current = node;
          }}
          aria-label={ariaLabel}
          spellCheck={false}
          {...shared}
        />
      ) : (
        <input
          ref={(node) => {
            inputRef.current = node;
          }}
          id={id}
          aria-label={ariaLabel}
          style={
            highlightVariables && value
              ? { color: "transparent", caretColor: "white" }
              : undefined
          }
          {...shared}
        />
      )}
      {token ? (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-lg border border-violet-300/15 bg-[#1a1029] shadow-2xl">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2 text-[9px] tracking-[0.12em] text-muted-foreground uppercase">
            <Braces size={12} className="text-violet-400" /> Variables del
            environment
          </div>
          {suggestions.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item.key)}
              className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left font-mono text-xs ${index === active ? "bg-violet-500/15 text-white" : "text-violet-200 hover:bg-white/5"}`}
            >
              <span>{`{{${item.key}}}`}</span>
              <span className="max-w-[45%] truncate text-[10px] text-muted-foreground">
                {item.value}
              </span>
            </button>
          ))}
          {!suggestions.length ? (
            <p className="px-3 py-3 text-[11px] text-muted-foreground">
              {variables.length
                ? "No hay variables que coincidan."
                : "Este environment no tiene variables."}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function HighlightedValue({ value }: { value: string }) {
  return (
    <>
      {value.split(/(\{\{[A-Za-z_][A-Za-z0-9_]*\}\})/g).map((part, index) =>
        /^\{\{.+\}\}$/.test(part) ? (
          <span
            key={`${part}-${index}`}
            className="font-semibold text-amber-300"
          >
            {part}
          </span>
        ) : (
          <span key={`${part}-${index}`} className="text-white">
            {part}
          </span>
        ),
      )}
    </>
  );
}
