import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppRootProps } from '@grafana/data';
const Showfast = React.lazy(() => import('../../pages/Showfast'));

function App(props: AppRootProps) {
  return (
    <Routes>
      {/* Default page */}
      <Route path="*" element={<Showfast />} />
    </Routes>
  );
}

export default App;
