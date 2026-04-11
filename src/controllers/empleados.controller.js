const {
  countActiveEmployeesByNegocio,
  countInactiveEmployeesByNegocio,
  getEmployeeByIdForNegocio,
  inactivateEmployeeByOwner,
  leaveBusinessBySelf,
  listInactiveEmployeesByNegocioPaginated,
  reactivateEmployeeByOwner,
  listActiveEmployeesByNegocio
} = require("../models/empleados.model");
const { getUsuarioById } = require("../models/usuarios.model");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePagination(query) {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const page = rawPage === undefined ? DEFAULT_PAGE : Number(rawPage);
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);

  if (!Number.isInteger(page) || page < 1) {
    return { error: "page debe ser un entero mayor o igual a 1" };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return { error: `limit debe ser un entero entre 1 y ${MAX_LIMIT}` };
  }

  return {
    page,
    limit,
    offset: (page - 1) * limit
  };
}

async function getOwnerScope(authUserId) {
  const usuario = await getUsuarioById(authUserId);

  if (!usuario) {
    return { error: { status: 404, message: "Usuario no encontrado" } };
  }

  if (usuario.rol !== "dueno") {
    return { error: { status: 403, message: "Solo el dueno puede gestionar empleados" } };
  }

  if (!usuario.id_negocio) {
    return { error: { status: 403, message: "Debes pertenecer a un negocio" } };
  }

  return { owner: usuario, idNegocio: usuario.id_negocio };
}

async function listActiveEmployees(req, res, next) {
  try {
    const pagination = parsePagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const scope = await getOwnerScope(req.auth.id_usuario);

    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const [empleados, total] = await Promise.all([
      listActiveEmployeesByNegocio(scope.idNegocio, {
        limit: pagination.limit,
        offset: pagination.offset
      }),
      countActiveEmployeesByNegocio(scope.idNegocio)
    ]);

    return res.json({
      estado: "activo",
      data: empleados,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
        hasNextPage: pagination.offset + empleados.length < total,
        hasPrevPage: pagination.page > 1
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getEmployeeById(req, res, next) {
  try {
    const scope = await getOwnerScope(req.auth.id_usuario);

    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const idEmpleado = Number(req.params.id);

    if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
      return res.status(400).json({ message: "id de empleado invalido" });
    }

    const empleado = await getEmployeeByIdForNegocio({
      idEmpleado,
      idNegocio: scope.idNegocio
    });

    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    return res.json({
      estado: empleado.rol === "pendiente" ? "inactivo" : "activo",
      empleado
    });
  } catch (error) {
    next(error);
  }
}

async function listInactiveEmployees(req, res, next) {
  try {
    const pagination = parsePagination(req.query);

    if (pagination.error) {
      return res.status(400).json({ message: pagination.error });
    }

    const scope = await getOwnerScope(req.auth.id_usuario);

    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const [empleados, total] = await Promise.all([
      listInactiveEmployeesByNegocioPaginated(scope.idNegocio, {
        limit: pagination.limit,
        offset: pagination.offset
      }),
      countInactiveEmployeesByNegocio(scope.idNegocio)
    ]);

    return res.json({
      estado: "inactivo",
      data: empleados,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / pagination.limit) : 0,
        hasNextPage: pagination.offset + empleados.length < total,
        hasPrevPage: pagination.page > 1
      }
    });
  } catch (error) {
    next(error);
  }
}

async function inactivateEmployee(req, res, next) {
  try {
    const scope = await getOwnerScope(req.auth.id_usuario);

    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const idEmpleado = Number(req.params.id);

    if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
      return res.status(400).json({ message: "id de empleado invalido" });
    }

    if (idEmpleado === Number(req.auth.id_usuario)) {
      return res.status(400).json({ message: "No puedes inactivarte a ti mismo" });
    }

    const empleado = await inactivateEmployeeByOwner({
      idEmpleado,
      idNegocio: scope.idNegocio
    });

    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado o ya inactivo" });
    }

    return res.json({
      message: "Empleado inactivado correctamente",
      empleado
    });
  } catch (error) {
    next(error);
  }
}

async function reactivateEmployee(req, res, next) {
  try {
    const scope = await getOwnerScope(req.auth.id_usuario);

    if (scope.error) {
      return res.status(scope.error.status).json({ message: scope.error.message });
    }

    const idEmpleado = Number(req.params.id);

    if (!Number.isInteger(idEmpleado) || idEmpleado <= 0) {
      return res.status(400).json({ message: "id de empleado invalido" });
    }

    const empleado = await reactivateEmployeeByOwner({
      idEmpleado,
      idNegocio: scope.idNegocio
    });

    if (!empleado) {
      return res.status(404).json({ message: "Empleado no encontrado o ya activo" });
    }

    return res.json({
      message: "Empleado reactivado correctamente",
      empleado
    });
  } catch (error) {
    next(error);
  }
}

async function leaveCurrentBusiness(req, res, next) {
  try {
    const idUsuario = Number(req.auth?.id_usuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      return res.status(401).json({ message: "Token invalido" });
    }

    const usuario = await getUsuarioById(idUsuario);

    if (!usuario) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (!usuario.id_negocio || usuario.rol === "pendiente") {
      return res.status(409).json({ message: "No perteneces a un negocio activo" });
    }

    if (usuario.rol === "dueno") {
      const totalEmpleadosActivos = await countActiveEmployeesByNegocio(usuario.id_negocio);

      if (totalEmpleadosActivos > 0) {
        return res.status(409).json({
          message: "No puedes salir del negocio mientras existan empleados activos"
        });
      }
    }

    const usuarioActualizado = await leaveBusinessBySelf({
      idUsuario,
      idNegocio: usuario.id_negocio
    });

    if (!usuarioActualizado) {
      return res.status(409).json({
        message: "No fue posible salir del negocio con el estado actual"
      });
    }

    return res.json({
      message: "Saliste del negocio correctamente",
      usuario: usuarioActualizado
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getEmployeeById,
  inactivateEmployee,
  leaveCurrentBusiness,
  listInactiveEmployees,
  reactivateEmployee,
  listActiveEmployees
};