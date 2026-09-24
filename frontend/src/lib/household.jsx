import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY = 'household_token'

const HouseholdContext = createContext(null)

export function HouseholdProvider({ children }) {
  const [state, setState] = useState({ householdId: null, name: null, loading: true, error: null })

  useEffect(() => {
    async function resolve() {
      const params = new URLSearchParams(window.location.search)
      const tokenFromUrl = params.get('h')
      const token = tokenFromUrl || localStorage.getItem(STORAGE_KEY)

      if (!token) {
        setState({ householdId: null, name: null, loading: false, error: 'no-token' })
        return
      }

      const { data, error } = await supabase.rpc('resolve_household_token', { token })
      const household = data?.[0]

      if (error || !household) {
        setState({ householdId: null, name: null, loading: false, error: 'invalid-token' })
        return
      }

      localStorage.setItem(STORAGE_KEY, token)
      if (tokenFromUrl) {
        params.delete('h')
        const query = params.toString()
        window.history.replaceState({}, '', window.location.pathname + (query ? `?${query}` : ''))
      }

      setState({ householdId: household.id, name: household.name, loading: false, error: null })
    }
    resolve()
  }, [])

  return <HouseholdContext.Provider value={state}>{children}</HouseholdContext.Provider>
}

export function useHousehold() {
  const ctx = useContext(HouseholdContext)
  if (!ctx) throw new Error('useHousehold must be used within a HouseholdProvider')
  return ctx
}
