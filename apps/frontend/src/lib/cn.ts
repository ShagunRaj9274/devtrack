import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names and lets later Tailwind utilities override earlier ones (e.g. w-auto over w-full). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
