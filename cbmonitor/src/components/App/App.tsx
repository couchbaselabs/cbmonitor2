import React from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';
import { ROUTES } from '../../constants';

const CBMonitor = React.lazy(() => import('../../pages/CBMonitor'));
const Showfast = React.lazy(() => import('../../pages/Showfast'));

function App(props: AppRootProps) {
  return (
    <Routes>
      {/* CBMonitor landing page with search */}
      <Route path={`/${ROUTES.CBMonitor}`} element={<CBMonitor />} />
      <Route path={ROUTES.CBMonitor} element={<CBMonitor />} />
      {/* Showfast components page */}
      <Route path={`/${ROUTES.Showfast}`} element={<Showfast />} />
      <Route path={ROUTES.Showfast} element={<Showfast />} />
      {/* Default redirect to cbmonitor. Can revisit this later. */}
      <Route index element={<Navigate to={ROUTES.CBMonitor} replace />} />
      <Route path="/" element={<Navigate to={ROUTES.CBMonitor} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.CBMonitor} replace />} />
    </Routes>
  );
}

export default App;
