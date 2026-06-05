import { Routes, Route } from 'react-router-dom'
import WeekView from './components/WeekView'

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50">
      <Routes>
        <Route path="/week/:planId" element={<WeekView />} />
        <Route
          path="*"
          element={
            <div className="flex items-center justify-center min-h-screen text-stone-400 text-lg">
              No meal plan selected.
            </div>
          }
        />
      </Routes>
    </div>
  )
}
