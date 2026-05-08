import { useEffect, useState } from "react";
import { useAssetUrl } from "../../hooks/useAssetUrl";

type QuestionImageProps = {
  path: string;
  alt: string;
  fullPagePath?: string;
};

export default function QuestionImage({ path, alt, fullPagePath }: QuestionImageProps) {
  const [showFullPage, setShowFullPage] = useState(false);
  const [failedUrl, setFailedUrl] = useState("");
  const image = useAssetUrl(path);
  const fullPageImage = useAssetUrl(fullPagePath);
  const failed = image.status === "error" || Boolean(image.url && failedUrl === image.url);
  const isLoading = image.status === "loading";
  const fullPageUrl = fullPageImage.status === "loaded" ? fullPageImage.url : "";

  useEffect(() => {
    setFailedUrl("");
  }, [path, image.url]);

  if (!path || image.status === "idle" || failed) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-[20px] border border-dashed border-white/50 bg-white/36 px-4 py-8 text-center text-sm text-ink/55 backdrop-blur">
        图片暂时无法显示：{path || "路径为空"}
      </div>
    );
  }

  if (isLoading || !image.url) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-[20px] border border-white/46 bg-white/36 px-4 py-8 text-center text-sm text-ink/45 backdrop-blur">
        正在加载图片...
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/56 bg-white/46 shadow-[0_18px_48px_rgba(29,29,31,0.07)] backdrop-blur">
      {fullPageUrl ? (
        <div className="flex justify-end border-b border-white/48 bg-white/32 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowFullPage(true)}
            className="rounded-full bg-white/58 px-3 py-1 text-xs font-semibold text-ink/56 transition hover:bg-white/76 hover:text-slateblue"
          >
            查看整页
          </button>
        </div>
      ) : null}
      <img
        src={image.url}
        alt={alt}
        className="h-auto w-full object-contain"
        loading="lazy"
        onError={() => setFailedUrl(image.url)}
      />
      {showFullPage && fullPageUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/28 px-4 py-6 backdrop-blur-md">
          <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-white/58 bg-white/76 shadow-[0_28px_90px_rgba(29,29,31,0.22)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/50 px-5 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink/42">
                  Full Page
                </p>
                <p className="mt-1 text-sm font-semibold text-ink/68">{fullPagePath}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPage(false)}
                className="rounded-full bg-white/72 px-4 py-2 text-sm font-semibold text-ink/62 transition hover:bg-white hover:text-slateblue"
              >
                关闭
              </button>
            </div>
            <div className="overflow-auto bg-white/42 p-4">
              <img
                src={fullPageUrl}
                alt={`${alt} 所在整页`}
                className="mx-auto h-auto max-h-none w-full max-w-4xl rounded-[18px] border border-line/70 bg-white shadow-[0_16px_42px_rgba(29,29,31,0.08)]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
