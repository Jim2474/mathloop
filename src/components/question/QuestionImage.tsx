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
      <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-line bg-white/60 px-4 py-8 text-center text-sm text-ink/55">
        图片暂时无法显示：{path || "路径为空"}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-soft">
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
