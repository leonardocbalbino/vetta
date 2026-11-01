import type { MDXComponents } from 'mdx/types';

/** Tipografia dos posts do blog (MDX). */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    h1: (p) => <h1 className="font-display text-3xl font-extrabold md:text-[2.5rem]" {...p} />,
    h2: (p) => <h2 className="font-display mt-8 text-2xl font-extrabold" {...p} />,
    h3: (p) => <h3 className="mt-6 text-xl font-bold" {...p} />,
    p: (p) => <p className="leading-relaxed" {...p} />,
    ul: (p) => <ul className="list-disc space-y-1 pl-6" {...p} />,
    ol: (p) => <ol className="list-decimal space-y-1 pl-6" {...p} />,
    a: (p) => <a className="text-action underline" {...p} />,
    blockquote: (p) => <blockquote className="border-l-4 border-accent pl-4 italic" {...p} />,
    ...components,
  };
}
