document.addEventListener('DOMContentLoaded', () => {
    let todasLasNoticiasOriginales = [];
    let todasLasNoticias = [];
    let favoritas = JSON.parse(localStorage.getItem('favoritas')) || [];
    let paginaActual = 1;
    const noticiasPorPagina = 10; // 10 noticias por página según requisito
    let terminoBusquedaActual = ''; // Variable para guardar el término de búsqueda actual
    let categoriasDisponibles = ['Todas']; // Lista de categorías disponibles
    let categoriaSeleccionada = 'Todas'; // Categoría seleccionada actualmente

    // Función para usar proxy CORS si es una URL externa
    function getProxiedUrl(url) {
        if (url.startsWith('http') && !url.includes('localhost')) {
            // Usar un servicio de proxy CORS públicamente disponible
            return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        }
        return url;
    }

    // Función para detectar el tipo de feed (ATOM o RSS)
    async function detectarTipoFeed(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
            
            // Verificar errores de parseo XML
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error('Error al analizar el XML: ' + parseError.textContent);
            }
            
            // Verificación básica de ATOM
            const feedElement = xmlDoc.querySelector('feed');
            if (feedElement) {
                return "atom";
            }
            
            // Verificación básica de RSS
            const rssElement = xmlDoc.querySelector('rss, channel');
            if (rssElement) {
                return "rss";
            }
            
            throw new Error('El documento no es un feed ATOM ni RSS válido');
        } catch (error) {
            console.error('Error en la validación del feed:', error);
            mostrarMensaje('El feed proporcionado no es válido: ' + error.message, "danger");
            return false;
        }
    }

    function mostrarMensaje(mensaje, tipo = "danger") {
        const alertaDiv = document.createElement('div');
        alertaDiv.className = `alert alert-${tipo} alert-dismissible fade show mt-3`;
        alertaDiv.innerHTML = `
            ${mensaje}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        document.querySelector('main.container').insertBefore(alertaDiv, document.getElementById('rss-container'));
        
        // Auto-cerrar después de 7 segundos
        setTimeout(() => {
            alertaDiv.classList.remove('show');
            setTimeout(() => alertaDiv.remove(), 500);
        }, 7000);
    }

    async function cargarFeed(url) {
        try {
            document.getElementById('loading-indicator').style.display = 'block';
            
            // Si es una URL externa, usar el proxy CORS
            const proxiedUrl = getProxiedUrl(url);
            console.log(`Cargando feed desde: ${url} (Proxy: ${proxiedUrl !== url})`);
            
            const response = await fetch(proxiedUrl);
            
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
            }
            
            const xmlText = await response.text();
            
            // Detectar y procesar según el tipo de feed
            const tipoFeed = await detectarTipoFeed(xmlText);
            
            if (tipoFeed === "atom") {
                console.log("Procesando feed ATOM");
                procesarATOM(xmlText);
            } else if (tipoFeed === "rss") {
                console.log("Procesando feed RSS");
                procesarRSS(xmlText);
            } else {
                throw new Error("Formato de feed no reconocido");
            }
        } catch (error) {
            console.error('Error al cargar el feed:', error);
            mostrarMensaje(`No se pudo cargar el feed: ${error.message}`);
        } finally {
            document.getElementById('loading-indicator').style.display = 'none';
        }
    }

    // Función para extraer imágenes de HTML o texto
    function extraerImagenDeHTML(htmlText) {
        if (!htmlText) return null;
        
        // Buscar etiquetas <img> con src
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/i;
        const imgMatch = htmlText.match(imgRegex);
        if (imgMatch && imgMatch[1]) {
            return imgMatch[1];
        }
        
        // Buscar URL de imagen
        const urlRegex = /(https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp))/i;
        const urlMatch = htmlText.match(urlRegex);
        if (urlMatch && urlMatch[1]) {
            return urlMatch[1];
        }
        
        return null;
    }

    // Función para extraer y actualizar categorías disponibles
    function actualizarCategoriasDisponibles(noticias) {
        categoriasDisponibles = ['Todas']; // Siempre incluir "Todas" como opción predeterminada
        
        // Recopilar todas las categorías únicas de todas las noticias
        const todasCategorias = new Set();
        
        noticias.forEach(noticia => {
            noticia.categorias.forEach(categoria => {
                todasCategorias.add(categoria);
            });
        });
        
        // Convertir el conjunto a un array y ordenar alfabéticamente
        const categoriasOrdenadas = Array.from(todasCategorias).sort();
        
        // Añadir las categorías ordenadas a las disponibles
        categoriasDisponibles = ['Todas', ...categoriasOrdenadas];
        
        // Actualizar el selector de categorías en la interfaz
        actualizarSelectorCategorias();
    }

    // Función para actualizar el selector de categorías en la interfaz
    function actualizarSelectorCategorias() {
        const selectorCategorias = document.getElementById('category-selector');
        if (!selectorCategorias) return; // Si no existe el selector, salir
        
        // Guardar la categoría actualmente seleccionada
        const categoriaActual = selectorCategorias.value;
        
        // Limpiar opciones existentes
        selectorCategorias.innerHTML = '';
        
        // Añadir nuevas opciones basadas en las categorías disponibles
        categoriasDisponibles.forEach(categoria => {
            const option = document.createElement('option');
            option.value = categoria;
            option.textContent = categoria;
            selectorCategorias.appendChild(option);
        });
        
        // Intentar restaurar la selección anterior si existe entre las nuevas opciones
        if (categoriasDisponibles.includes(categoriaActual)) {
            selectorCategorias.value = categoriaActual;
        } else {
            selectorCategorias.value = 'Todas';
            categoriaSeleccionada = 'Todas';
        }
    }

    function procesarATOM(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
            
            // Procesamos entradas ATOM
            const entradas = xmlDoc.querySelectorAll('entry');
            
            if (entradas.length === 0) {
                throw new Error('No se encontraron entradas en el feed ATOM');
            }
            
            todasLasNoticiasOriginales = Array.from(entradas).map(entrada => {
                // Procesamiento de imagen
                let imagen = null;
                
                // 1. Buscar en links con rel="enclosure" o type que empiece por "image/"
                const links = entrada.querySelectorAll('link');
                for (const link of links) {
                    const rel = link.getAttribute('rel');
                    const type = link.getAttribute('type');
                    const href = link.getAttribute('href');
                    
                    if (rel === 'enclosure' || (type && type.startsWith('image/'))) {
                        imagen = href;
                        break;
                    }
                }
                
                // 2. Buscar en contenido HTML (content o summary)
                if (!imagen) {
                    const content = entrada.querySelector('content')?.textContent;
                    if (content) {
                        imagen = extraerImagenDeHTML(content);
                    }
                    
                    if (!imagen) {
                        const summary = entrada.querySelector('summary')?.textContent;
                        if (summary) {
                            imagen = extraerImagenDeHTML(summary);
                        }
                    }
                }
                
                // 3. Buscar en cualquier elemento <media:thumbnail>, <media:content>, o similares
                if (!imagen) {
                    const mediaThumbnail = entrada.querySelector('media\\:thumbnail, thumbnail');
                    if (mediaThumbnail && mediaThumbnail.getAttribute('url')) {
                        imagen = mediaThumbnail.getAttribute('url');
                    }
                }
                
                if (!imagen) {
                    const mediaContent = entrada.querySelector('media\\:content, content');
                    if (mediaContent && mediaContent.getAttribute('url') && mediaContent.getAttribute('type')?.startsWith('image/')) {
                        imagen = mediaContent.getAttribute('url');
                    }
                }
                
                // Obtener la URL del enlace principal
                let enlace = '';
                const linkPrincipal = Array.from(entrada.querySelectorAll('link')).find(
                    link => link.getAttribute('rel') === 'alternate' || !link.getAttribute('rel')
                );
                
                if (linkPrincipal) {
                    enlace = linkPrincipal.getAttribute('href');
                }
                
                // Obtener categorías
                const categorias = Array.from(entrada.querySelectorAll('category')).map(
                    cat => cat.getAttribute('term') || cat.textContent
                );
                
                // Fecha de publicación
                let fechaPublicacion = '';
                if (entrada.querySelector('published')) {
                    fechaPublicacion = entrada.querySelector('published').textContent;
                } else if (entrada.querySelector('updated')) {
                    fechaPublicacion = entrada.querySelector('updated').textContent;
                }
                
                // Obtener autor
                let autor = 'Desconocido';
                const authorElement = entrada.querySelector('author');
                if (authorElement) {
                    const authorName = authorElement.querySelector('name');
                    if (authorName) {
                        autor = authorName.textContent;
                    } else {
                        autor = authorElement.textContent.trim();
                    }
                }
                
                console.log("Imagen encontrada:", imagen); // Para depuración
                
                return {
                    titulo: entrada.querySelector('title')?.textContent || 'Sin título',
                    enlace: enlace,
                    autor: autor,
                    fecha: fechaPublicacion,
                    resumen: entrada.querySelector('summary')?.textContent || 
                            entrada.querySelector('content')?.textContent || 
                            'Resumen no disponible',
                    categorias: categorias.length > 0 ? categorias : ['General'],
                    imagen: imagen
                };
            });
            
            todasLasNoticias = [...todasLasNoticiasOriginales];
            actualizarCategoriasDisponibles(todasLasNoticiasOriginales);
            actualizarInfoPaginacion();
            mostrarNoticias();
            
            // Mostrar mensaje de éxito
            mostrarMensaje(`Feed ATOM cargado correctamente. Se encontraron ${todasLasNoticiasOriginales.length} entradas.`, "success");
        } catch (error) {
            console.error('Error al procesar ATOM:', error);
            throw error;
        }
    }

    function procesarRSS(xmlText) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
            
            // Intentar obtener los items de RSS
            const channel = xmlDoc.querySelector('channel');
            const items = channel ? channel.querySelectorAll('item') : xmlDoc.querySelectorAll('item');
            
            if (items.length === 0) {
                throw new Error('No se encontraron items en el feed RSS');
            }
            
            // Comprobar si hay una imagen de canal para usar como fallback
            let canalImagen = null;
            const channelImage = channel ? channel.querySelector('image') : null;
            if (channelImage && channelImage.querySelector('url')) {
                canalImagen = channelImage.querySelector('url').textContent;
            } else if (channelImage && channelImage.getAttribute('url')) {
                canalImagen = channelImage.getAttribute('url');
            }
            
            todasLasNoticiasOriginales = Array.from(items).map(item => {
                // Intentar encontrar una imagen
                let imagen = null;
                
                // 1. Buscar en enclosure
                const enclosure = item.querySelector('enclosure');
                if (enclosure && enclosure.getAttribute('url')) {
                    const type = enclosure.getAttribute('type');
                    if (!type || type.startsWith('image/')) {
                        imagen = enclosure.getAttribute('url');
                    }
                }
                
                // 2. Buscar en media:content o media:thumbnail
                if (!imagen) {
                    const mediaContent = item.querySelector('media\\:content, content');
                    if (mediaContent && mediaContent.getAttribute('url')) {
                        const type = mediaContent.getAttribute('type');
                        if (!type || type.startsWith('image/')) {
                            imagen = mediaContent.getAttribute('url');
                        }
                    }
                }
                
                if (!imagen) {
                    const mediaThumbnail = item.querySelector('media\\:thumbnail, thumbnail');
                    if (mediaThumbnail && mediaThumbnail.getAttribute('url')) {
                        imagen = mediaThumbnail.getAttribute('url');
                    }
                }
                
                // 3. Buscar imágenes dentro de la descripción
                if (!imagen) {
                    const descripcion = item.querySelector('description')?.textContent;
                    if (descripcion) {
                        imagen = extraerImagenDeHTML(descripcion);
                    }
                }
                
                // 4. Si no se encuentra ninguna imagen, usar la imagen del canal como fallback
                if (!imagen) {
                    imagen = canalImagen;
                }
                
                // Obtener autor
                let autor = 'Desconocido';
                const creatorElement = item.querySelector('dc\\:creator, creator');
                if (creatorElement) {
                    autor = creatorElement.textContent;
                } else if (item.querySelector('author')) {
                    autor = item.querySelector('author').textContent;
                }
                
                // Obtener categorías
                const categorias = item.querySelectorAll('category');
                const categoriasList = categorias.length > 0 
                    ? Array.from(categorias).map(cat => cat.textContent.trim()) 
                    : ['General'];
                
                console.log("Imagen encontrada RSS:", imagen); // Para depuración
                
                return {
                    titulo: item.querySelector('title')?.textContent || 'Sin título',
                    enlace: item.querySelector('link')?.textContent || '#',
                    autor: autor,
                    fecha: item.querySelector('pubDate')?.textContent || 
                           item.querySelector('dc\\:date')?.textContent || 
                           new Date().toISOString(),
                    resumen: item.querySelector('description')?.textContent || 'Resumen no disponible',
                    categorias: categoriasList,
                    imagen: imagen
                };
            });
            
            todasLasNoticias = [...todasLasNoticiasOriginales];
            actualizarCategoriasDisponibles(todasLasNoticiasOriginales);
            actualizarInfoPaginacion();
            mostrarNoticias();
            
            // Mostrar mensaje de éxito
            mostrarMensaje(`Feed RSS cargado correctamente. Se encontraron ${todasLasNoticiasOriginales.length} items.`, "success");
        } catch (error) {
            console.error('Error al procesar RSS:', error);
            throw error;
        }
    }

    // Nueva función para resaltar términos de búsqueda en un texto
    function resaltarTermino(texto, termino) {
        if (!termino || termino.trim() === '') {
            return texto;
        }
        
        // Escapar caracteres especiales en el término de búsqueda para usar en regex
        const terminoEscapado = termino.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        
        // Crear una expresión regular para buscar el término (insensible a mayúsculas/minúsculas)
        const regex = new RegExp(`(${terminoEscapado})`, 'gi');
        
        // Reemplazar todas las ocurrencias con la versión resaltada
        return texto.replace(regex, '<span class="highlight">$1</span>');
    }

    // Nueva función para limpiar HTML preservando solo etiquetas específicas
    function limpiarHTMLPreservandoEtiquetas(html) {
        // Crear un elemento temporal
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Obtener el texto plano
        const textoPlano = tempDiv.textContent || tempDiv.innerText || html;
        
        return textoPlano;
    }

    // Función para filtrar noticias por categoría
    function filtrarNoticiasPorCategoria() {
        // Si la categoría seleccionada es "Todas", no filtramos
        if (categoriaSeleccionada === 'Todas') {
            return todasLasNoticiasOriginales;
        }
        
        // Filtrar las noticias que contienen la categoría seleccionada
        return todasLasNoticiasOriginales.filter(noticia => 
            noticia.categorias.some(categoria => categoria === categoriaSeleccionada)
        );
    }

    // Función combinada para aplicar búsqueda y filtro de categoría
    function aplicarFiltros() {
        // Primero filtramos por categoría
        let noticiasFiltradas = filtrarNoticiasPorCategoria();
        
        // Luego aplicamos el filtro de búsqueda si hay un término
        const terminoBusqueda = document.getElementById('search-input').value.toLowerCase().trim();
        terminoBusquedaActual = terminoBusqueda;
        
        if (terminoBusqueda !== '') {
            noticiasFiltradas = noticiasFiltradas.filter(noticia => 
                noticia.titulo.toLowerCase().includes(terminoBusqueda) || 
                noticia.resumen.toLowerCase().includes(terminoBusqueda) ||
                noticia.autor.toLowerCase().includes(terminoBusqueda) ||
                noticia.categorias.some(cat => cat.toLowerCase().includes(terminoBusqueda))
            );
        }
        
        // Actualizar la lista de noticias a mostrar
        todasLasNoticias = noticiasFiltradas;
        
        // Resetear a página 1 cuando se aplican filtros
        paginaActual = 1;
        
        // Actualizar paginación e interfaz
        actualizarInfoPaginacion();
        mostrarNoticias();
    }

    function mostrarNoticias() {
        const inicio = (paginaActual - 1) * noticiasPorPagina;
        const fin = paginaActual * noticiasPorPagina;
        const noticiasAMostrar = todasLasNoticias.slice(inicio, fin);
        const contenedorNoticias = document.getElementById('rss-container');
        contenedorNoticias.innerHTML = '';

        if (noticiasAMostrar.length === 0) {
            contenedorNoticias.innerHTML = `
                <div class="col-12 text-center">
                    <div class="alert alert-info">
                        No se encontraron noticias que coincidan con tu búsqueda.
                    </div>
                </div>`;
            return;
        }

        noticiasAMostrar.forEach(noticia => {
            // Limitar el resumen a 150 caracteres
            const resumenCorto = noticia.resumen.length > 150 ? 
                                noticia.resumen.substring(0, 150) + '...' : 
                                noticia.resumen;
            
            // Limpiar HTML del resumen antes de destacar términos
            const resumenLimpio = limpiarHTMLPreservandoEtiquetas(resumenCorto);
            
            // Resaltar término de búsqueda en título y resumen si existe
            const tituloResaltado = resaltarTermino(noticia.titulo, terminoBusquedaActual);
            const resumenResaltado = resaltarTermino(resumenLimpio, terminoBusquedaActual);
            
            const tarjeta = document.createElement('div');
            tarjeta.classList.add('col-md-4', 'mb-4');
            
            // Usar la imagen del feed o el placeholder si no hay imagen
            const imgSrc = noticia.imagen || 'image/placeholder.png';
            
            tarjeta.innerHTML = `
                <div class="card">
                    <img src="${imgSrc}" class="card-img-top" alt="Imagen de la noticia" onerror="this.src='image/placeholder.png'">
                    <div class="card-body">
                        <h5 class="card-title">${tituloResaltado}</h5>
                        <p class="card-text">${resumenResaltado}</p>
                        <p class="text-muted">Autor: ${noticia.autor} | Fecha: ${formatearFecha(noticia.fecha)}</p>
                        <div class="mb-2">
                            ${noticia.categorias.map(categoria => {
                                const isSelected = categoria === categoriaSeleccionada;
                                return `<span class="badge ${isSelected ? 'badge-selected' : ''}">${categoria}</span>`;
                            }).join(' ')}
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <button class="btn btn-outline-primary btn-favorito" data-enlace="${noticia.enlace}">
                                <i class="bi ${favoritas.some(fav => fav.enlace === noticia.enlace) ? 'bi-star-fill' : 'bi-star'}"></i> 
                                ${favoritas.some(fav => fav.enlace === noticia.enlace) ? 'Favorita' : 'Favorito'}
                            </button>
                            <a href="${noticia.enlace}" target="_blank" class="btn btn-outline-secondary">
                                <i class="bi bi-link-45deg"></i> Leer más
                            </a>
                        </div>
                    </div>
                </div>
            `;
            contenedorNoticias.appendChild(tarjeta);
        });

        document.querySelectorAll('.btn-favorito').forEach(boton => {
            boton.addEventListener('click', () => alternarFavorito(boton));
        });
        
        // Añadir evento clic a las categorías en los badges
        document.querySelectorAll('.badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                const categoria = e.target.textContent;
                document.getElementById('category-selector').value = categoria;
                categoriaSeleccionada = categoria;
                aplicarFiltros();
            });
        });
        
        // Actualizar la paginación
        actualizarControlesPaginacion();
    }

    function formatearFecha(fechaStr) {
        try {
            const fecha = new Date(fechaStr);
            if (isNaN(fecha.getTime())) return fechaStr; // Si no es una fecha válida, devuelve el string original
            return fecha.toLocaleDateString();
        } catch (e) {
            return fechaStr;
        }
    }

    function alternarFavorito(boton) {
        const enlace = boton.getAttribute('data-enlace');
        const index = favoritas.findIndex(noticia => noticia.enlace === enlace);
        
        if (index !== -1) {
            favoritas.splice(index, 1);
            boton.innerHTML = '<i class="bi bi-star"></i> Favorito';
        } else {
            const noticiaAgregar = todasLasNoticias.find(noticia => noticia.enlace === enlace);
            favoritas.push(noticiaAgregar);
            boton.innerHTML = '<i class="bi bi-star-fill"></i> Favorita';
        }
        localStorage.setItem('favoritas', JSON.stringify(favoritas));
    }

    function buscarNoticias() {
        aplicarFiltros();
    }

    function actualizarInfoPaginacion() {
        const totalPaginas = Math.ceil(todasLasNoticias.length / noticiasPorPagina) || 1;
        document.getElementById('pagina-actual').textContent = `Página ${paginaActual} de ${totalPaginas}`;
        document.getElementById('total-noticias').textContent = `Total: ${todasLasNoticias.length} noticias`;
    }

    function actualizarControlesPaginacion() {
        const totalPaginas = Math.ceil(todasLasNoticias.length / noticiasPorPagina) || 1;
        
        // Botones anterior y siguiente
        const prevButton = document.getElementById('prev-page');
        const nextButton = document.getElementById('next-page');
        
        // Actualizar clases para el botón anterior
        if (paginaActual <= 1) {
            prevButton.classList.add('disabled');
            prevButton.setAttribute('aria-disabled', 'true');
        } else {
            prevButton.classList.remove('disabled');
            prevButton.removeAttribute('aria-disabled');
        }
        
        // Actualizar clases para el botón siguiente
        if (paginaActual >= totalPaginas) {
            nextButton.classList.add('disabled');
            nextButton.setAttribute('aria-disabled', 'true');
        } else {
            nextButton.classList.remove('disabled');
            nextButton.removeAttribute('aria-disabled');
        }
        
        // Actualizar texto de paginación
        document.getElementById('pagina-actual').textContent = `Página ${paginaActual} de ${totalPaginas}`;
        
        // Generar números de página
        const paginacionNumerica = document.getElementById('pagination-numbers');
        paginacionNumerica.innerHTML = '';
        
        // Si no hay páginas, no mostrar paginación numérica
        if (totalPaginas <= 1) {
            return;
        }
        
        // Determinar qué páginas mostrar (máximo 5)
        let startPage = Math.max(1, paginaActual - 2);
        let endPage = Math.min(totalPaginas, startPage + 4);
        
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }
        
        // Añadir primera página si no está incluida
        if (startPage > 1) {
            const li = document.createElement('li');
            li.className = 'page-item';
            li.innerHTML = `<a class="page-link" href="#" data-page="1">1</a>`;
            paginacionNumerica.appendChild(li);
            
            if (startPage > 2) {
                const ellipsis = document.createElement('li');
                ellipsis.className = 'page-item disabled';
                ellipsis.innerHTML = `<span class="page-link">...</span>`;
                paginacionNumerica.appendChild(ellipsis);
            }
        }
        
        // Añadir páginas numeradas
        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === paginaActual ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#" data-page="${i}">${i}</a>`;
            paginacionNumerica.appendChild(li);
        }
        
        // Añadir última página si no está incluida
        if (endPage < totalPaginas) {
            if (endPage < totalPaginas - 1) {
                const ellipsis = document.createElement('li');
                ellipsis.className = 'page-item disabled';
                ellipsis.innerHTML = `<span class="page-link">...</span>`;
                paginacionNumerica.appendChild(ellipsis);
            }
            
            const li = document.createElement('li');
            li.className = 'page-item';
            li.innerHTML = `<a class="page-link" href="#" data-page="${totalPaginas}">${totalPaginas}</a>`;
            paginacionNumerica.appendChild(li);
        }
        
        // Añadir eventos a los números de página
        document.querySelectorAll('.page-link[data-page]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                paginaActual = parseInt(e.target.getAttribute('data-page'));
                mostrarNoticias();
                window.scrollTo(0, 0);
            });
        });
    }

    // Eventos de paginación
    document.getElementById('next-page').addEventListener('click', (e) => {
        e.preventDefault();
        const totalPaginas = Math.ceil(todasLasNoticias.length / noticiasPorPagina);
        if (paginaActual < totalPaginas) {
            paginaActual++;
            mostrarNoticias();
            window.scrollTo(0, 0);
        }
    });

    document.getElementById('prev-page').addEventListener('click', (e) => {
        e.preventDefault();
        if (paginaActual > 1) {
            paginaActual--;
            mostrarNoticias();
            window.scrollTo(0, 0);
        }
    });

    // Eventos de navegación
    document.getElementById('ver-favoritas').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('h1').textContent = "Noticias Favoritas";
        todasLasNoticias = [...favoritas];
        paginaActual = 1;
        actualizarInfoPaginacion();
        mostrarNoticias();
    });

    document.getElementById('ver-todas').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelector('h1').textContent = "Últimas Noticias";
        todasLasNoticias = [...todasLasNoticiasOriginales];
        paginaActual = 1;
        actualizarInfoPaginacion();
        mostrarNoticias();
        
        // Resetear filtro de categoría
        if (document.getElementById('category-selector')) {
            document.getElementById('category-selector').value = 'Todas';
            categoriaSeleccionada = 'Todas';
        }
    });

    // Añadir evento para el selector de categorías
    function inicializarSelectorCategorias() {
        // Crear el selector de categorías si no existe
        if (!document.getElementById('category-selector')) {
            const filterContainer = document.createElement('div');
            filterContainer.className = 'filter-container mb-4';
            filterContainer.innerHTML = `
                <div class="d-flex align-items-center">
                    <label for="category-selector" class="me-2 fw-bold">Filtrar por categoría:</label>
                    <select id="category-selector" class="form-select">
                        <option value="Todas">Todas las categorías</option>
                    </select>
                </div>
            `;
            
            // Insertar antes del contenedor de noticias
            const container = document.querySelector('main.container');
            const rssContainer = document.getElementById('rss-container');
            container.insertBefore(filterContainer, rssContainer);
            
            // Añadir evento para cambio de categoría
            const categorySelector = document.getElementById('category-selector');
            categorySelector.addEventListener('change', (e) => {
                categoriaSeleccionada = e.target.value;
                aplicarFiltros();
            });
        }
        
        // Actualizar las categorías disponibles
        actualizarCategoriasDisponibles(todasLasNoticiasOriginales);
    }

    // Inicializar el selector de categorías después de cargar la página
    inicializarSelectorCategorias();

    // Buscar noticias al escribir o al hacer clic en el botón de búsqueda
    document.getElementById('search-input').addEventListener('input', buscarNoticias);
    document.getElementById('search-button').addEventListener('click', buscarNoticias);

    // Añadir evento para la tecla Enter en el campo de búsqueda
    document.getElementById('search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            buscarNoticias();
        }
    });

    // Cambiar feed
    document.getElementById('feed-url-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const nuevaUrl = document.getElementById('feed-url').value.trim();
        if (nuevaUrl) {
            cargarFeed(nuevaUrl);
            // Cerrar el modal manualmente
            const modal = bootstrap.Modal.getInstance(document.getElementById('feed-url-modal'));
            if (modal) {
                modal.hide();
            }
        }
    });
});
