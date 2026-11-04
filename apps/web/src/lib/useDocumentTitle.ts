import { useEffect } from 'react';

/** Set the browser tab's title while a page is shown, and put the previous one back after. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
