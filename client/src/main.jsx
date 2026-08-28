import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext.jsx';
import 'pretendard/dist/web/variable/pretendardvariable.css';
import './styles/theme.css';
import './styles/app.css';
// app.css는 공통 베이스 스타일이라 각 페이지/컴포넌트 CSS보다 먼저 로드돼야
// 같은 클래스명이 있어도 나중 것(구체적인 것)이 이긴다. App은 그 이후에 import.
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
