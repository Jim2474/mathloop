import { Link, useParams } from "react-router-dom";
import EmptyState from "../components/common/EmptyState";
import QuestionImage from "../components/question/QuestionImage";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";
import { getAnswerImagePaths, getQuestionImagePaths } from "../utils/questionImages";
import { inferQuestionType } from "../utils/questionStats";
import { formatDateTime } from "../utils/date";
import { stateLabel } from "../utils/reviewLabels";

export default function QuestionDetailPage() {
  const { id } = useParams();
  const { questions, isLoading, error } = useQuestionStore();
  const { cards, getQuestionLogs } = useReviewStore();
  const question = questions.find((item) => item.id === id);

  if (isLoading) {
    return <EmptyState title="正在读取题目" description="正在加载 /data/questions.json。" />;
  }

  if (error) {
    return <EmptyState title="题库读取失败" description={error} />;
  }

  if (!question) {
    return (
      <div className="space-y-4">
        <Link to="/questions" className="text-sm font-medium text-slateblue hover:underline">
          返回题库
        </Link>
        <EmptyState title="没有找到这道题" description={`题目 ID：${id ?? "未知"}`} />
      </div>
    );
  }

  const questionImagePaths = getQuestionImagePaths(question);
  const answerImagePaths = getAnswerImagePaths(question);
  const questionType = inferQuestionType(question);
  const reviewCard = cards[question.id];
  const questionLogs = getQuestionLogs(question.id);

  return (
    <div className="space-y-6">
      <Link to="/questions" className="text-sm font-medium text-slateblue hover:underline">
        返回题库
      </Link>

      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-sm font-semibold text-slateblue">{question.id}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal">{question.questionNo}</h2>
            <p className="mt-2 text-sm text-ink/65">{question.bookName}</p>
          </div>
          <span
            className={[
              "w-fit rounded-full px-3 py-1 text-xs font-semibold",
              question.meta.uncertain ? "bg-cinnabar/12 text-cinnabar" : "bg-moss/12 text-moss",
            ].join(" ")}
          >
            {question.meta.uncertain ? "uncertain" : "confirmed"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetaItem label="章节" value={question.chapter} />
          <MetaItem label="题型" value={questionType} />
          <MetaItem label="小节" value={question.section} />
          <MetaItem label="页码范围" value={question.pageRangeText} />
          <MetaItem label="PDF 页码" value={question.pdfPageLabel} />
          <MetaItem label="印刷页码" value={question.printedPageNumber} />
          <MetaItem label="源页" value={`${question.pageStart} - ${question.pageEnd}`} />
          <MetaItem label="状态" value={question.status || "未设置"} />
        </div>

        {question.meta.note ? (
          <div className="mt-5 rounded-md border border-cinnabar/25 bg-cinnabar/8 p-4 text-sm leading-6 text-ink/75">
            <span className="font-semibold text-cinnabar">备注：</span>
            {question.meta.note}
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        <h3 className="text-xl font-semibold">FSRS 复习状态</h3>
        {reviewCard ? (
          <>
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <MetaItem label="当前状态" value={stateLabel(reviewCard.card.state)} />
              <MetaItem label="下次复习" value={formatDateTime(reviewCard.card.due)} />
              <MetaItem label="复习次数" value={reviewCard.card.reps} />
              <MetaItem label="遗忘次数" value={reviewCard.card.lapses} />
              <MetaItem label="最近复习" value={formatDateTime(reviewCard.card.last_review)} />
            </div>
            <div className="mt-5 rounded-md border border-line bg-paper/65 p-4 text-sm text-ink/65">
              数据来源：{reviewCard.seededFromJson ? "OpenClaw JSON 初始导入" : "本地 ts-fsrs card"}
            </div>
          </>
        ) : (
          <EmptyState title="尚未初始化 FSRS card" description="题库加载后会自动创建本地复习 card。" />
        )}
      </section>

      <section className="rounded-lg border border-line bg-white/70 p-5 shadow-soft">
        <h3 className="text-xl font-semibold">复习历史</h3>
        {questionLogs.length > 0 ? (
          <div className="mt-4 divide-y divide-line/70">
            {questionLogs.map((log) => (
              <div key={log.id} className="grid gap-2 py-4 md:grid-cols-[1fr_1fr_1fr_1fr] md:items-center">
                <div>
                  <p className="text-sm font-semibold">{log.rating}</p>
                  <p className="text-xs text-ink/55">{log.ratingLabel}</p>
                </div>
                <p className="text-sm text-ink/70">{formatDateTime(log.reviewedAt)}</p>
                <p className="text-sm text-ink/70">状态：{log.stateBefore} → {log.stateAfter}</p>
                <p className="text-sm text-ink/70">下次：{formatDateTime(log.nextDue)}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无复习历史" description="在 /review 完成评分后，这里会显示该题的历史记录。" />
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold">题目截图</h3>
        {questionImagePaths.length > 0 ? (
          <div className="space-y-4">
            {questionImagePaths.map((path, index) => (
              <QuestionImage
                key={path}
                path={path}
                alt={`${question.questionNo} 题目截图 ${index + 1}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="暂无题目图片" description="questionImage 和 questionImages 都为空。" />
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-xl font-semibold">答案图片</h3>
        {answerImagePaths.length > 0 ? (
          <div className="space-y-4">
            {answerImagePaths.map((path, index) => (
              <QuestionImage
                key={path}
                path={path}
                alt={`${question.questionNo} 答案截图 ${index + 1}`}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="暂无答案图片" description="answerImage 和 answerImages 为空。" />
        )}
      </section>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-line bg-paper/70 p-3">
      <p className="text-xs font-semibold text-ink/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-ink">{value || "未标注"}</p>
    </div>
  );
}
