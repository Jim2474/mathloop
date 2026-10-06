import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import EmptyState from "../components/common/EmptyState";
import BackupPage from "../pages/BackupPage";
import DashboardPage from "../pages/DashboardPage";
import ImportPdfPage from "../pages/ImportPdfPage";
import MistakeEntryPage from "../pages/MistakeEntryPage";
import QuestionDetailPage from "../pages/QuestionDetailPage";
import QuestionListPage from "../pages/QuestionListPage";
import ReviewPage from "../pages/ReviewPage";
import { isTauriRuntime } from "../services/desktopBridge";
import { claimCompletedPdfJob, type PdfJob } from "../services/pdfImportService";
import { useBeforeUnloadSave } from "../hooks/useBeforeUnloadSave";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  useBeforeUnloadSave();

  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const loadedBookId = useQuestionStore((state) => state.loadedBookId);
  const hasHydrated = useReviewStore((state) => state.hasHydrated);
  const isReady = useReviewStore((state) => state.isReady);
  const readyBookId = useReviewStore((state) => state.readyBookId);
  const reviewLoadError = useReviewStore((state) => state.loadError);
  const questionError = useQuestionStore((state) => state.error);
  const syncQuestionLibrary = useReviewStore((state) => state.syncQuestionLibrary);

  const loadBooks = useBookStore((state) => state.loadBooks);
  const activeBookId = useBookStore((state) => state.activeBookId);
  const booksLoaded = useBookStore((state) => state.isLoaded);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<PdfJob>("pdf-import-progress", ({ payload }) => {
      if (claimCompletedPdfJob(payload, useBookStore.getState().activeBookId)) {
        void loadQuestions();
      }
    }).then((stop) => { if (disposed) stop(); else unlisten = stop; })
      .catch((error) => console.error("PDF 导入事件监听失败", error));
    return () => { disposed = true; unlisten?.(); };
  }, [loadQuestions]);

  // Load book list on mount
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // Bootstrap and load questions when book is known
  useEffect(() => {
    if (booksLoaded) void loadQuestions();
  }, [activeBookId, booksLoaded, loadQuestions]);

  // Sync review library only after book-scoped data is fully loaded.
  // isReady is set by loadReviewForCurrentBook(); running syncQuestionLibrary
  // before that would trigger a persist write with empty mistakeRecords,
  // wiping any data that was loaded from localStorage.
  useEffect(() => {
    if (hasHydrated && isReady && activeBookId === loadedBookId && activeBookId === readyBookId && questions.length > 0) {
      syncQuestionLibrary(questions);
    }
  }, [hasHydrated, isReady, questions, loadedBookId, readyBookId, activeBookId, syncQuestionLibrary]);

  return (
    <AppShell>
      {!booksLoaded || (activeBookId && (!isReady || readyBookId !== activeBookId || loadedBookId !== activeBookId)) ? (
        <EmptyState title={reviewLoadError || questionError ? "数据读取失败" : "正在读取书本数据"}
          description={reviewLoadError ?? questionError ?? "正在读取对应题库和复习记录。"} />
      ) : <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/mistakes" element={<MistakeEntryPage />} />
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/questions/:id" element={<QuestionDetailPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/pdf-import" element={<ImportPdfPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>}
    </AppShell>
  );
}
