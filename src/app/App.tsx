import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import BackupPage from "../pages/BackupPage";
import DashboardPage from "../pages/DashboardPage";
import QuestionDetailPage from "../pages/QuestionDetailPage";
import QuestionListPage from "../pages/QuestionListPage";
import ReviewPage from "../pages/ReviewPage";
import { useQuestionStore } from "../store/useQuestionStore";
import { useReviewStore } from "../store/useReviewStore";

export default function App() {
  const loadQuestions = useQuestionStore((state) => state.loadQuestions);
  const questions = useQuestionStore((state) => state.questions);
  const initializeCards = useReviewStore((state) => state.initializeCards);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  useEffect(() => {
    if (questions.length > 0) {
      initializeCards(questions);
    }
  }, [initializeCards, questions]);

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/questions" element={<QuestionListPage />} />
        <Route path="/questions/:id" element={<QuestionDetailPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
