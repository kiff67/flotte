import { useEffect, useRef, useState } from "react";

interface AutocompleteInputProps<T> {
  value: string;
  onChange: (value: string) => void;
  fetchSuggestions: (query: string) => Promise<T[]>;
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder?: string;
  label?: string;
  minChars?: number;
  renderItem?: (item: T) => ReactNodeLike;
  textarea?: boolean;
}

type ReactNodeLike = string | JSX.Element;

export function AutocompleteInput<T>({
  value,
  onChange,
  fetchSuggestions,
  getLabel,
  onSelect,
  placeholder,
  label,
  minChars = 2,
  renderItem,
  textarea = false,
}: AutocompleteInputProps<T>) {
  const [suggestions, setSuggestions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleChange(newValue: string) {
    onChange(newValue);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (newValue.trim().length < minChars) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchSuggestions(newValue.trim());
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlight(0);
      } catch {
        setSuggestions([]);
      }
    }, 200);
  }

  function selectItem(item: T) {
    onSelect(item);
    setOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectItem(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const InputTag = textarea ? "textarea" : "input";

  return (
    <div className="field autocomplete" ref={containerRef}>
      {label && <label>{label}</label>}
      <InputTag
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => value.trim().length >= minChars && suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        rows={textarea ? 3 : undefined}
      />
      {open && (
        <ul className="autocomplete-list">
          {suggestions.map((item, i) => (
            <li
              key={i}
              className={i === highlight ? "active" : ""}
              onMouseDown={(e) => {
                e.preventDefault();
                selectItem(item);
              }}
            >
              {renderItem ? renderItem(item) : getLabel(item)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
