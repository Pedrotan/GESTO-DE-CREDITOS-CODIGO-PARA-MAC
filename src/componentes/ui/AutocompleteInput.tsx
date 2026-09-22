import React, { useState, useEffect, useRef } from 'react';
import { Input } from './input';
import { cn } from '@/bibliotecas/utils';
import { db } from '@/bibliotecas/bd';

interface AutocompleteInputProps extends React.ComponentProps<"input"> {
    onValueChange?: (value: string) => void;
    language?: 'pt-AO' | 'pt-PT' | 'both' | 'pt' | 'ao';
}

export function AutocompleteInput({ value, onChange, onValueChange, className, language = 'both', ...props }: AutocompleteInputProps) {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [inputValue, setInputValue] = useState(String(value || ''));
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync input value with external value prop
    useEffect(() => {
        setInputValue(String(value || ''));
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const normalizeLanguage = (lang: AutocompleteInputProps['language']) => {
        if (lang === 'ao') return 'pt-AO';
        if (lang === 'pt') return 'pt-PT';
        return lang || 'both';
    };

    const editDistance = (a: string, b: string) => {
        const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
        for (let j = 1; j <= b.length; j++) matrix[0][j] = j;

        for (let i = 1; i <= a.length; i++) {
            for (let j = 1; j <= b.length; j++) {
                matrix[i][j] = a[i - 1] === b[j - 1]
                    ? matrix[i - 1][j - 1]
                    : Math.min(matrix[i - 1][j - 1], matrix[i][j - 1], matrix[i - 1][j]) + 1;
            }
        }
        return matrix[a.length][b.length];
    };

    const getSuggestions = async (text: string) => {
        if (!text) {
            setSuggestions([]);
            return;
        }

        // Get the last word being typed
        const lastWord = text.split(/\s+/).pop() || '';
        if (lastWord.length < 2) {
            setSuggestions([]);
            return;
        }

        try {
            const normalizedLanguage = normalizeLanguage(language);
            const params = normalizedLanguage === 'both'
                ? [`${lastWord}%`]
                : [`${lastWord}%`, normalizedLanguage];
            const whereLanguage = normalizedLanguage === 'both'
                ? ''
                : `AND language IN (?, 'both')`;

            let results = await db.query<{ word: string }>(
                `SELECT word FROM dictionary
                 WHERE word LIKE ? COLLATE NOCASE ${whereLanguage}
                 ORDER BY length(word), word
                 LIMIT 5`,
                params
            );

            if (results.length === 0 && lastWord.length >= 4) {
                const correctionParams = normalizedLanguage === 'both'
                    ? [`${lastWord[0]}%`]
                    : [`${lastWord[0]}%`, normalizedLanguage];
                const correctionCandidates = await db.query<{ word: string }>(
                    `SELECT word FROM dictionary
                     WHERE word LIKE ? COLLATE NOCASE ${whereLanguage}
                     LIMIT 80`,
                    correctionParams
                );
                results = correctionCandidates
                    .map(row => ({ ...row, distance: editDistance(lastWord.toLowerCase(), row.word.toLowerCase()) }))
                    .filter(row => row.distance <= 2)
                    .sort((a, b) => a.distance - b.distance || a.word.length - b.word.length)
                    .slice(0, 5);
            }

            const words = results.map(r => r.word);
            setSuggestions(words);
        } catch (err) {
            console.error("Failed to fetch suggestions:", err);
            setSuggestions([]);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInputValue(val);
        if (onChange) onChange(e);
        if (onValueChange) onValueChange(val);

        getSuggestions(val);
        setShowSuggestions(true);
        setActiveIndex(-1);
    };

    const selectSuggestion = (suggestion: string) => {
        const words = inputValue.split(/\s+/);
        words.pop(); // Remove the last word being typed
        words.push(suggestion);
        const newValue = words.join(' ') + ' '; // Append space after autocompleted word
        
        setInputValue(newValue);
        if (onValueChange) onValueChange(newValue);
        
        // Trigger React Form change
        const event = {
            target: { value: newValue }
        } as React.ChangeEvent<HTMLInputElement>;
        if (onChange) onChange(event);

        setSuggestions([]);
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (showSuggestions && suggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(prev => (prev + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                if (activeIndex >= 0 && activeIndex < suggestions.length) {
                    e.preventDefault();
                    selectSuggestion(suggestions[activeIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowSuggestions(false);
            }
        }
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <Input
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => setShowSuggestions(true)}
                className={className}
                {...props}
            />
            {showSuggestions && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-white dark:bg-slate-950 p-1 text-slate-950 dark:text-slate-50 shadow-md outline-none animate-in fade-in-50 slide-in-from-top-1">
                    {suggestions.map((suggestion, idx) => (
                        <div
                            key={suggestion}
                            onClick={() => selectSuggestion(suggestion)}
                            className={cn(
                                "relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 dark:hover:bg-slate-800",
                                idx === activeIndex && "bg-slate-100 dark:bg-slate-800"
                            )}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
