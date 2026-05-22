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
import { useBookStore } from "../store/useBookStore";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const hasHydrated = useReviewStore((state) => state.hasHydrated);
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

  // Sync review library when hydrated
  useEffect(() => {
    if (hasHydrated && questions.length > 0) {
      syncQuestionLibrary(questions);
      cleanupOrphanReviewData(questions);
    }
  }, [hasHydrated, questions, syncQuestionLibrary, cleanupOrphanReviewData]);

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
