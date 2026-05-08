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
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const hasHydrated = useReviewStore((state) => state.hasHydrated);
  const syncQuestionLibrary = useReviewStore((state) => state.syncQuestionLibrary);

  useEffect(() => {
    async function boot() {
      await initializeDesktopRuntime();
      await loadQuestions();
    }
    void boot();
  }, [loadQuestions]);

  useEffect(() => {
    if (hasHydrated && questions.length > 0) {
      syncQuestionLibrary(questions);
    }
  }, [hasHydrated, questions, syncQuestionLibrary]);

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
