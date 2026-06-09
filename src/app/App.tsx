import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import BackupPage from "../pages/BackupPage";
import DashboardPage from "../pages/DashboardPage";
import MistakeEntryPage from "../pages/MistakeEntryPage";
import QuestionDetailPage from "../pages/QuestionDetailPage";
import QuestionListPage from "../pages/QuestionListPage";
import ReviewPage from "../pages/ReviewPage";
import { initializeDesktopRuntime } from "../services/desktopBridge";
import { useBeforeUnloadSave } from "../hooks/useBeforeUnloadSave";
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  useBeforeUnloadSave();

  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const hasHydrated = useReviewStore((state) => state.hasHydrated);
  const isReady = useReviewStore((state) => state.isReady);
  const syncQuestionLibrary = useReviewStore((state) => state.syncQuestionLibrary);
  const cleanupOrphanReviewData = useReviewStore((state) => state.cleanupOrphanReviewData);

  const loadBooks = useBookStore((state) => state.loadBooks);
  const activeBookId = useBookStore((state) => state.activeBookId);

  // Load book list on mount
  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  // Bootstrap and load questions when book is known
  useEffect(() => {
    async function boot() {
      await initializeDesktopRuntime(activeBookId ?? undefined);
      await loadQuestions();
    }
    void boot();
  }, [activeBookId, loadQuestions]);

  // Sync review library only after book-scoped data is fully loaded.
  // isReady is set by loadReviewForCurrentBook(); running syncQuestionLibrary
  // before that would trigger a persist write with empty mistakeRecords,
  // wiping any data that was loaded from localStorage.
  useEffect(() => {
    if (hasHydrated && isReady && questions.length > 0) {
      syncQuestionLibrary(questions);
      cleanupOrphanReviewData(questions);
    }
  }, [hasHydrated, isReady, questions, syncQuestionLibrary, cleanupOrphanReviewData]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/mistakes" element={<MistakeEntryPage />} />
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/questions/:id" element={<QuestionDetailPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
