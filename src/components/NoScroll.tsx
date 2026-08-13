'use client';

import { useEffect } from 'react';

// Locks the page that renders it to exactly one screen. The attribute drives
// the rules in globals.css: body gets a definite height, so the page column
// can size itself against the viewport instead of growing past it.
export default function NoScroll() {
  useEffect(() => {
    document.body.setAttribute('data-fixed', 'true');
    return () => {
      document.body.removeAttribute('data-fixed');
    };
  }, []);
  return null;
}
