type ShareData = {
  title: string;
  url: string;
};

export async function handleShare({ title, url }: ShareData) {
  const shareData = {
    title,
    text: `Check out this event: ${title}`,
    url,
  };

  if (navigator.share) {
    try {
      await navigator.share(shareData);
    } catch (err) {
      console.error("Error sharing:", err);
    }
  } else {
    try {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    } catch (err) {
      console.error("Clipboard copy failed:", err);
    }
  }
}
