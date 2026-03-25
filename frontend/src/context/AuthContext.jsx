/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { clearAuthState, getAuthState, saveAuthState } from '../lib/authStorage'
import { disconnectEcho, initializeEcho } from '../lib/echo'
import { getDefaultRouteForUser, hasPermission, permissionListForUser } from '../lib/permissions'

const AuthContext = createContext(null)
const EMPTY_AUTH_STATE = { user: null, token: null, role: null }

export function AuthProvider({ children }) {
  const [authState, setAuthState] = useState(getAuthState)

  const applyAuthState = useCallback(({ user, token, role }) => {
    const nextState = { user, token, role }
    setAuthState(nextState)
    saveAuthState(nextState)
  }, [])

  const clearSession = useCallback(() => {
    setAuthState(EMPTY_AUTH_STATE)
    clearAuthState()
    disconnectEcho()
  }, [])

  const login = useCallback(({ user, token, role }) => {
    applyAuthState({ user, token, role })
  }, [applyAuthState])

  const logout = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout')
    } catch {
      // Ignore remote logout failures and clear local auth anyway.
    } finally {
      clearSession()
    }
  }, [clearSession])

  useEffect(() => {
    if (authState.token) {
      initializeEcho(authState.token)
    } else {
      disconnectEcho()
    }
  }, [authState.token])

  useEffect(() => {
    if (!authState.token) {
      return undefined
    }

    let active = true

    const hydrateUser = async () => {
      try {
        const response = await api.get('/api/v1/auth/me')
        const payload = response.data?.data

        if (!active) {
          return
        }

        setAuthState((current) => {
          const nextState = {
            ...current,
            role: payload?.role ?? current.role,
            user: payload?.user ?? current.user,
          }

          saveAuthState(nextState)
          return nextState
        })
      } catch (error) {
        const status = error?.response?.status

        if (active && (status === 401 || status === 403)) {
          clearSession()
        }
      }
    }

    hydrateUser()

    return () => {
      active = false
    }
  }, [authState.token, clearSession])

  const permissions = useMemo(
    () => permissionListForUser(authState.user, authState.role),
    [authState.role, authState.user],
  )
  const can = useCallback(
    (ability) => hasPermission(authState.user, ability, authState.role),
    [authState.role, authState.user],
  )
  const defaultRoute = useMemo(
    () => getDefaultRouteForUser(authState.user, authState.role),
    [authState.role, authState.user],
  )

  const value = useMemo(
    () => ({
      ...authState,
      isAuthenticated: Boolean(authState.token),
      permissions,
      can,
      defaultRoute,
      login,
      logout,
    }),
    [authState, can, defaultRoute, login, logout, permissions],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
