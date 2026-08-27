import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';

import IntroPage from './pages/IntroPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import ProfileSetupPage from './pages/ProfileSetupPage.jsx';
import HomePage from './pages/HomePage.jsx';
import PreferencePage from './pages/PreferencePage.jsx';
import MatchingProgressPage from './pages/MatchingProgressPage.jsx';
import MatchResultPage from './pages/MatchResultPage.jsx';
import MapPage from './pages/MapPage.jsx';
import RestaurantListPage from './pages/RestaurantListPage.jsx';
import RecruitPage from './pages/RecruitPage.jsx';
import BuddyListPage from './pages/BuddyListPage.jsx';
import ProposalWaitPage from './pages/ProposalWaitPage.jsx';
import ChatListPage from './pages/ChatListPage.jsx';
import ChatRoomPage from './pages/ChatRoomPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import MyPage from './pages/MyPage.jsx';

function Private({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="screen center">불러오는 중…</div>;
  if (!user) return <Navigate to="/" replace />;
  if (user.signup_step === 'PROFILE') return <Navigate to="/signup/profile" replace />;
  return children;
}

export default function App() {
  return (
    <div className="phone-frame">
      <Routes>
        <Route path="/" element={<IntroPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/signup/profile" element={<ProfileSetupPage />} />

        <Route path="/home" element={<Private><HomePage /></Private>} />
        <Route path="/preference" element={<Private><PreferencePage /></Private>} />
        <Route path="/matching/:id" element={<Private><MatchingProgressPage /></Private>} />
        <Route path="/matching/:id/result" element={<Private><MatchResultPage /></Private>} />

        <Route path="/map" element={<Private><MapPage /></Private>} />
        <Route path="/restaurants" element={<Private><RestaurantListPage /></Private>} />
        <Route path="/recruit" element={<Private><RecruitPage /></Private>} />
        <Route path="/restaurants/:id/buddies" element={<Private><BuddyListPage /></Private>} />
        <Route path="/proposals/:id/wait" element={<Private><ProposalWaitPage /></Private>} />

        <Route path="/chats" element={<Private><ChatListPage /></Private>} />
        <Route path="/chats/:matchId" element={<Private><ChatRoomPage /></Private>} />
        <Route path="/inbox" element={<Private><InboxPage /></Private>} />
        <Route path="/mypage" element={<Private><MyPage /></Private>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
