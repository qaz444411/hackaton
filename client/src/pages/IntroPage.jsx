import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import introFood from '../assets/intro-food.jpg';
import './IntroPage.css';

/** 소개 페이지 — 시작하기 / 로그인하기 (최종 디자인) */
export default function IntroPage() {
  return (
    <div className="screen">
      <div className="screen__body" style={{ padding: 0 }}>
        <div className="intro2">
          <header className="intro2__header">
            <img className="intro2__logo" src={logo} alt="DO밥" />
          </header>

          <div className="intro2__text">
            <p className="intro2__title">오늘, 같이 먹을<br />친구를 찾아볼까요?</p>
            <p className="intro2__desc">혼밥 대신 취향이 맞는 사람과 한 끼를 함께해보세요.</p>
          </div>

          <div className="intro2__photo-wrap">
            <div className="intro2__photo" style={{
              backgroundImage: `linear-gradient(0deg, rgba(34,30,20,.5) 0%, rgba(34,30,20,.08) 45%, rgba(34,30,20,0) 65%), url(${introFood})`,
            }} />
          </div>

          <div className="intro2__actions">
            <Link to="/signup" className="intro2__submit">시작하기</Link>
            <div className="intro2__login-row">
              <span>이미 계정이 있나요?</span>
              <Link to="/login">로그인하기</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
