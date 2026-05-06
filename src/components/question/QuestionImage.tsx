import { useState } from "react";
import { toPublicAssetUrl } from "../../utils/questionImages";

type QuestionImageProps = {
  path: string;
  alt: string;
};

export default function QuestionImage({ path, alt }: QuestionImageProps) {
  const [failed, setFailed] = useState(false);
  const url = toPublicAssetUrl(path);

  if (!url || failed) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-[20px] border border-dashed border-white/50 bg-white/36 px-4 py-8 text-center text-sm text-ink/55 backdrop-blur">
        图片暂时无法显示：{path || "路径为空"}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[20px] border border-white/56 bg-white/46 shadow-[0_18px_48px_rgba(29,29,31,0.07)] backdrop-blur">
      <img
        src={url}
        alt={alt}
        className="h-auto w-full object-contain"
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
