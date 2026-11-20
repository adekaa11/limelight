import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Archive from "./pages/Archive";
import Year from "./pages/Year";
import NewDay from "./pages/NewDay";
import DayView from "./pages/DayView";
import Lab from "./pages/Lab";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Archive />} />
        <Route path="/year" element={<Year />} />
        <Route path="/new" element={<NewDay />} />
        <Route path="/day/:id" element={<DayView />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="*" element={<p className="py-20 text-center font-serif text-2xl">Такой страницы в дневнике нет</p>} />
      </Route>
    </Routes>
  );
}
