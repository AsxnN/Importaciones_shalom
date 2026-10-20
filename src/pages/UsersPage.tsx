import { useEffect, useMemo, useState } from 'react'
import { userService } from '../services/userService'
import type { AppUser, RoleItem } from '../types/users'

interface UsersPageProps {
  onBack: () => void
}

export function UsersPage({ onBack }: UsersPageProps) {
  // 1. Datos principales
  const [users, setUsers] = useState<AppUser[]>([])
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 2. Filtros y Búsqueda
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')

  // 3. Modal de Creación / Edición
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<AppUser | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Campos del formulario
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formOperatorCode, setFormOperatorCode] = useState('')
  const [formSelectedRoles, setFormSelectedRoles] = useState<string[]>(['OPERARIO'])
  const [formActive, setFormActive] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)

  // 4. Modal de confirmación para eliminar
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<AppUser | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Carga de usuarios y roles
  const loadData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [uList, rList] = await Promise.all([
        userService.getUsers(),
        userService.getRoles()
      ])
      setUsers(uList)
      setRoles(rList)
    } catch (err: any) {
      setErrorMsg(`Error al cargar datos de usuarios: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  // Métricas calculadas para la tira de indicadores
  const metrics = useMemo(() => {
    const total = users.length
    const activos = users.filter((u) => u.activo).length
    const admins = users.filter((u) => u.roles.includes('ADMINISTRADOR')).length
    const operarios = users.filter((u) => u.roles.includes('OPERARIO')).length

    return { total, activos, admins, operarios }
  }, [users])

  // Filtrado reactivo de usuarios
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Filtro por texto
      const search = searchTerm.trim().toLowerCase()
      if (search) {
        const matchName = u.nombre_completo.toLowerCase().includes(search)
        const matchEmail = (u.correo || '').toLowerCase().includes(search)
        const matchCode = (u.codigo_operario || '').toLowerCase().includes(search)
        if (!matchName && !matchEmail && !matchCode) return false
      }

      // Filtro por rol
      if (roleFilter !== 'ALL') {
        if (!u.roles.includes(roleFilter)) return false
      }

      // Filtro por estado
      if (statusFilter === 'ACTIVE' && !u.activo) return false
      if (statusFilter === 'INACTIVE' && u.activo) return false

      return true
    })
  }, [users, searchTerm, roleFilter, statusFilter])

  // Abrir modal para crear
  const handleOpenCreateModal = () => {
    setEditingUser(null)
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormOperatorCode('')
    setFormSelectedRoles(['OPERARIO'])
    setFormActive(true)
    setFormError(null)
    setModalOpen(true)
  }

  // Abrir modal para editar
  const handleOpenEditModal = (user: AppUser) => {
    setEditingUser(user)
    setFormName(user.nombre_completo)
    setFormEmail(user.correo || '')
    setFormPassword('')
    setFormOperatorCode(user.codigo_operario || '')
    setFormSelectedRoles([...user.roles])
    setFormActive(user.activo)
    setFormError(null)
    setModalOpen(true)
  }

  // Guardar usuario (Crear o Actualizar)
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!formName.trim()) {
      setFormError('El nombre completo es obligatorio.')
      return
    }
    if (!formEmail.trim()) {
      setFormError('El correo electrónico es obligatorio.')
      return
    }
    if (!editingUser && (!formPassword || formPassword.trim().length < 6)) {
      setFormError('La contraseña inicial es obligatoria y debe tener al menos 6 caracteres.')
      return
    }
    if (editingUser && formPassword.trim() && formPassword.trim().length < 6) {
      setFormError('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (formSelectedRoles.length === 0) {
      setFormError('Debe seleccionar al menos un rol de acceso.')
      return
    }

    setIsSubmitting(true)

    try {
      if (editingUser) {
        // Actualización
        const res = await userService.updateUser({
          id_usuario: editingUser.id_usuario,
          auth_user_id: editingUser.auth_user_id,
          nombre_completo: formName,
          correo: formEmail,
          password: formPassword.trim() ? formPassword.trim() : undefined,
          codigo_operario: formOperatorCode,
          roles: formSelectedRoles,
          activo: formActive
        })

        if (!res.success) {
          setFormError(res.error || 'No se pudo actualizar el usuario.')
          return
        }

        setSuccessMsg(`Usuario ${formName} actualizado correctamente.`)
      } else {
        // Creación
        const res = await userService.createUser({
          nombre_completo: formName,
          correo: formEmail,
          password: formPassword,
          codigo_operario: formOperatorCode,
          roles: formSelectedRoles,
          activo: formActive
        })

        if (!res.success) {
          setFormError(res.error || 'No se pudo crear el usuario.')
          return
        }

        setSuccessMsg(`Usuario ${formName} registrado exitosamente.`)
      }

      setModalOpen(false)
      await loadData()
    } catch (err: any) {
      setFormError(`Error al procesar usuario: ${err.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Alternar estado activo / inactivo
  const handleToggleStatus = async (user: AppUser) => {
    const newStatus = !user.activo
    const actionLabel = newStatus ? 'activar' : 'desactivar'

    try {
      const res = await userService.toggleUserStatus(user.id_usuario, newStatus)
      if (!res.success) {
        setErrorMsg(res.error || `No se pudo ${actionLabel} el usuario.`)
        return
      }

      setSuccessMsg(`Usuario ${user.nombre_completo} ${newStatus ? 'activado' : 'desactivado'} con éxito.`)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error al cambiar estado: ${err.message}`)
    }
  }

  // Confirmar y eliminar usuario
  const handleConfirmDelete = async () => {
    if (!deleteConfirmUser) return
    setIsDeleting(true)

    try {
      const res = await userService.deleteUser(deleteConfirmUser.id_usuario)
      if (!res.success) {
        setErrorMsg(res.error || 'No se pudo eliminar el usuario.')
      } else {
        if (res.error) {
          // Soft-delete informativo
          setSuccessMsg(res.error)
        } else {
          setSuccessMsg(`Usuario ${deleteConfirmUser.nombre_completo} eliminado correctamente.`)
        }
      }
      setDeleteConfirmUser(null)
      await loadData()
    } catch (err: any) {
      setErrorMsg(`Error al eliminar usuario: ${err.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  // Alternar selección de rol en el formulario
  const toggleRole = (roleName: string) => {
    setFormSelectedRoles((prev) => {
      if (prev.includes(roleName)) {
        return prev.filter((r) => r !== roleName)
      } else {
        return [...prev, roleName]
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* 1. Cabecera Principal */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <button type="button" className="link-back" onClick={onBack} style={{ marginBottom: '8px' }}>
            Volver al resumen
          </button>
          <h1 className="page-title" style={{ margin: 0 }}>
            Usuarios y control de accesos
          </h1>
          <p className="page-subtitle" style={{ margin: '4px 0 0 0' }}>
            Administración de cuentas, perfiles de personal, asignación de roles y códigos para la aplicación móvil.
          </p>
        </div>

        <button
          type="button"
          className="button primary"
          onClick={handleOpenCreateModal}
        >
          Crear nuevo usuario
        </button>
      </div>

      {/* Alertas de Notificación */}
      {errorMsg && (
        <div className="panel" style={{ backgroundColor: '#FDF3F2', borderLeft: '4px solid var(--color-danger)', padding: '12px 16px' }}>
          <p style={{ margin: 0, color: 'var(--color-danger)', fontSize: '14px', fontWeight: 500 }}>
            {errorMsg}
          </p>
        </div>
      )}

      {successMsg && (
        <div className="panel" style={{ backgroundColor: '#F2FAF4', borderLeft: '4px solid var(--color-success)', padding: '12px 16px' }}>
          <p style={{ margin: 0, color: 'var(--color-success)', fontSize: '14px', fontWeight: 500 }}>
            {successMsg}
          </p>
        </div>
      )}

      {/* 2. Tira Horizontal de Indicadores Clave */}
      <div className="indicator-strip">
        <div className="indicator-card">
          <span className="indicator-label">Total usuarios</span>
          <span className="indicator-value">{metrics.total}</span>
          <span className="indicator-context">Cuentas en el sistema</span>
        </div>
        <div className="indicator-card">
          <span className="indicator-label">Usuarios activos</span>
          <span className="indicator-value" style={{ color: 'var(--color-success)' }}>
            {metrics.activos}
          </span>
          <span className="indicator-context">Habilitados para operar</span>
        </div>
        <div className="indicator-card">
          <span className="indicator-label">Administradores</span>
          <span className="indicator-value">{metrics.admins}</span>
          <span className="indicator-context">Control total y seguridad</span>
        </div>
        <div className="indicator-card">
          <span className="indicator-label">Operarios de muelle</span>
          <span className="indicator-value">{metrics.operarios}</span>
          <span className="indicator-context">Recepción y almacenes</span>
        </div>
      </div>

      {/* 3. Panel de Filtros y Búsqueda */}
      <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* Campo de búsqueda */}
          <div style={{ flex: '1 1 280px', maxWidth: '420px' }}>
            <input
              type="text"
              placeholder="Buscar por nombre, correo o código de operario…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: 'var(--color-surface)',
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px'
              }}
            />
          </div>

          {/* Filtros de estado */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className={`button button-sm ${statusFilter === 'ALL' ? 'primary' : 'secondary'}`}
              onClick={() => setStatusFilter('ALL')}
            >
              Todos ({users.length})
            </button>
            <button
              type="button"
              className={`button button-sm ${statusFilter === 'ACTIVE' ? 'primary' : 'secondary'}`}
              onClick={() => setStatusFilter('ACTIVE')}
            >
              Solo activos ({metrics.activos})
            </button>
            <button
              type="button"
              className={`button button-sm ${statusFilter === 'INACTIVE' ? 'primary' : 'secondary'}`}
              onClick={() => setStatusFilter('INACTIVE')}
            >
              Inactivos ({metrics.total - metrics.activos})
            </button>
          </div>
        </div>

        {/* Filtro por Rol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
            Filtrar por rol:
          </span>
          <button
            type="button"
            className={`button button-sm ${roleFilter === 'ALL' ? 'primary' : 'secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setRoleFilter('ALL')}
          >
            Todos
          </button>
          <button
            type="button"
            className={`button button-sm ${roleFilter === 'ADMINISTRADOR' ? 'primary' : 'secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setRoleFilter('ADMINISTRADOR')}
          >
            Administradores
          </button>
          <button
            type="button"
            className={`button button-sm ${roleFilter === 'COMPRADOR' ? 'primary' : 'secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setRoleFilter('COMPRADOR')}
          >
            Compradores
          </button>
          <button
            type="button"
            className={`button button-sm ${roleFilter === 'OPERARIO' ? 'primary' : 'secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setRoleFilter('OPERARIO')}
          >
            Operarios
          </button>
          <button
            type="button"
            className={`button button-sm ${roleFilter === 'AUDITOR' ? 'primary' : 'secondary'}`}
            style={{ padding: '4px 10px', fontSize: '12px' }}
            onClick={() => setRoleFilter('AUDITOR')}
          >
            Auditores
          </button>
        </div>
      </div>

      {/* 4. Tabla Principal de Usuarios */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          {loading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              Cargando lista de usuarios…
            </div>
          ) : filteredUsers.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '15px', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                No se encontraron usuarios que coincidan con los filtros aplicados.
              </p>
              <button
                type="button"
                className="button secondary button-sm"
                style={{ marginTop: '12px' }}
                onClick={() => {
                  setSearchTerm('')
                  setRoleFilter('ALL')
                  setStatusFilter('ALL')
                }}
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Nombre completo</th>
                  <th>Correo electrónico</th>
                  <th>Código operario</th>
                  <th>Roles de acceso</th>
                  <th>Estado</th>
                  <th>Fecha de registro</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id_usuario}>
                    <td>
                      <strong style={{ color: 'var(--color-text-primary)' }}>{u.nombre_completo}</strong>
                      {!u.auth_user_id && (
                        <span
                          style={{
                            display: 'block',
                            fontSize: '11px',
                            color: 'var(--color-warning)',
                            marginTop: '2px'
                          }}
                        >
                          Sin cuenta de acceso vinculada
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{u.correo || '—'}</td>
                    <td>
                      {u.codigo_operario ? (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            backgroundColor: 'var(--color-brand-soft)',
                            color: 'var(--color-brand-deep)',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600
                          }}
                        >
                          {u.codigo_operario}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {u.roles.length > 0 ? (
                          u.roles.map((r) => (
                            <span
                              key={r}
                              style={{
                                display: 'inline-block',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: 600,
                                backgroundColor:
                                  r === 'ADMINISTRADOR'
                                    ? '#EAF0F6'
                                    : r === 'COMPRADOR'
                                    ? '#F0EBF8'
                                    : r === 'OPERARIO'
                                    ? 'var(--color-brand-soft)'
                                    : '#EBF3ED',
                                color:
                                  r === 'ADMINISTRADOR'
                                    ? '#1C3D5A'
                                    : r === 'COMPRADOR'
                                    ? '#4A2574'
                                    : r === 'OPERARIO'
                                    ? 'var(--color-brand)'
                                    : '#1B472A'
                              }}
                            >
                              {r.charAt(0) + r.slice(1).toLowerCase()}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--color-danger)' }}>Sin rol asignado</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                          backgroundColor: u.activo ? '#F2FAF4' : '#F4F6F8',
                          color: u.activo ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          border: `1px solid ${u.activo ? 'var(--color-success)' : 'var(--color-border)'}`
                        }}
                      >
                        {u.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="button secondary button-sm"
                          onClick={() => handleOpenEditModal(u)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`button button-sm ${u.activo ? 'secondary' : 'primary'}`}
                          style={{
                            color: u.activo ? 'var(--color-warning)' : undefined
                          }}
                          onClick={() => void handleToggleStatus(u)}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="button secondary button-sm"
                          style={{ color: 'var(--color-danger)' }}
                          onClick={() => setDeleteConfirmUser(u)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 5. MODAL: Crear o Editar Usuario */}
      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '580px', width: '92%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-brand-deep)' }}>
                {editingUser ? `Modificar usuario: ${editingUser.nombre_completo}` : 'Registrar nuevo usuario'}
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Cerrar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {formError && (
                <div style={{ padding: '10px 14px', backgroundColor: '#FDF3F2', borderRadius: '6px', borderLeft: '4px solid var(--color-danger)' }}>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-danger)', fontWeight: 500 }}>
                    {formError}
                  </p>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Juan Pérez Quispe"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Correo electrónico *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="usuario@shalom.pe"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                    Código de operario (App Móvil)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. OP-101"
                    value={formOperatorCode}
                    onChange={(e) => setFormOperatorCode(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      background: 'var(--color-surface)',
                      color: 'var(--color-text-primary)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                  {editingUser ? 'Nueva contraseña (opcional)' : 'Contraseña de ingreso inicial *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder={editingUser ? 'Dejar en blanco para conservar la contraseña actual' : 'Mínimo 6 caracteres'}
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    background: 'var(--color-surface)',
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px'
                  }}
                />
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block', marginTop: '3px' }}>
                  {editingUser
                    ? 'Escribe una nueva clave (mínimo 6 caracteres) solo si deseas cambiarla; si la dejas en blanco, se mantiene la actual.'
                    : 'El usuario podrá iniciar sesión con este correo y contraseña en la web o en la app móvil.'}
                </span>
              </div>

              {/* Selección de Roles */}
              <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
                  Roles y permisos asignados *
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  {roles.map((r) => {
                    const isSelected = formSelectedRoles.includes(r.nombre_rol)
                    return (
                      <label
                        key={r.id_rol}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '10px',
                          padding: '10px 12px',
                          border: `1px solid ${isSelected ? 'var(--color-brand)' : 'var(--color-border)'}`,
                          backgroundColor: isSelected ? 'var(--color-brand-soft)' : 'var(--color-surface)',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRole(r.nombre_rol)}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <strong style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                            {r.nombre_rol.charAt(0) + r.nombre_rol.slice(1).toLowerCase()}
                          </strong>
                          <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.3 }}>
                            {r.descripcion || 'Sin descripción'}
                          </p>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Estado de la cuenta */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                <input
                  type="checkbox"
                  id="form-active"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                />
                <label htmlFor="form-active" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', cursor: 'pointer' }}>
                  Cuenta activa y habilitada para operar
                </label>
              </div>

              {/* Botones del Modal */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px', borderTop: '1px solid var(--color-border)', paddingTop: '14px' }}>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Guardando…' : editingUser ? 'Guardar cambios' : 'Registrar usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. MODAL: Confirmar Eliminación */}
      {deleteConfirmUser && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: '440px', width: '90%' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ margin: 0, fontSize: '18px', color: 'var(--color-danger)' }}>
                Confirmar eliminación
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeleteConfirmUser(null)}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.5 }}>
              ¿Estás seguro de que deseas eliminar la cuenta de <strong>{deleteConfirmUser.nombre_completo}</strong> ({deleteConfirmUser.correo})?
            </p>

            <p className="muted" style={{ margin: '0 0 20px 0', fontSize: '13px' }}>
              Si el usuario ya cuenta con movimientos históricos, recepciones o auditorías en el sistema, será desactivado automáticamente para preservar la trazabilidad contable.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleteConfirmUser(null)}
                disabled={isDeleting}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="button primary"
                style={{ backgroundColor: 'var(--color-danger)' }}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Eliminando…' : 'Eliminar usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
