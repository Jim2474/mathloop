import { useEffect, useState } from "react";
import { useAssetUrl } from "../../hooks/useAssetUrl";
import type { Question } from "../../types/question";
import { getQuestionImagePaths } from "../../utils/questionImages";

type QuestionThumbnailProps = {
  question: Question;
};

export default function QuestionThumbnail({ question }: QuestionThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState("");
  const path = getQuestionImagePaths(question)[0];
  const image = useAssetUrl(path);
  const failed = image.status === "error" || Boolean(image.url && failedUrl === image.url);

  useEffect(() => {
    setFailedUrl("");
  }, [path, image.url]);

  if (!path || image.status === "idle" || failed) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-[16px] border border-dashed border-white/54 bg-white/36 px-3 text-center text-xs font-semibold text-ink/45 sm:w-36">
        无题图
      </div>
    );
  }

  if (image.status === "loading" || !image.url) {
    return (
      <div className="flex h-20 w-full items-center justify-center rounded-[16px] border border-white/54 bg-white/36 px-3 text-center text-xs font-semibold text-ink/45 sm:w-36">
        加载中
      </div>
    );
  }

  return (
    <div className="h-20 w-full overflow-hidden rounded-[16px] border border-white/54 bg-white/48 sm:w-36">
      <img
        src={image.url}
        alt={`${question.questionNo} 预览`}
        className="h-full w-full object-cover object-bottom"
        loading="lazy"
        onError={() => setFailedUrl(image.url)}
      />
    </div>
  );
}
