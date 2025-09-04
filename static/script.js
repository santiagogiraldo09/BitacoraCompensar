// Variables globales
let isCameraActive = false; // Nos dice si la cámara ya fue encendida
let currentQuestionIndex = 0;
let currentFacingMode = "environment";
let currentStream = null;
const capturedPhotos = []; // Array para guardar fotos en base64
const capturedVideos = []; // Array para guardar videos en base64
let mediaRecorder;
let audioChunks = [];
let isRecording = false; // Semáforo para saber si ya hay una grabación en curso
let currentTargetInput = null; // Para saber qué campo de texto estamos llenando
const questions = [
    "¿Cuál es el tipo de informe?",
    "Mencione la sede",
    "Mencione los repuestos utilizados",
    "Mencione los repuestos a cotizar"
];
const responses = [];

async function saveToSharePointList() {
    try {
        const respuestas = {
            zona_intervencion: document.getElementById('question_0').value,
            items: document.getElementById('question_1').value,
            metros_lineales: document.getElementById('question_2').value,
            proximas_tareas: document.getElementById('question_3').value,
        };

        const response = await fetch('/guardar-en-lista-sharepoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ respuestas })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Error al guardar");
        
        alert("¡Registro guardado en la lista de SharePoint!");
        console.log("ID del registro:", result.id_registro);
    } catch (error) {
        console.error("Error:", error);
        alert(`Error: ${error.message}`);
    }
}

function startRecording() {
    console.log("🎙️ Iniciando grabación...");

    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks = [];

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log("🛑 Grabación terminada. Enviando audio...");
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', audioBlob, 'respuesta.webm');

            fetch('/transcribe-audio', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.text) {
                    console.log("✅ Transcripción:", data.text);
                    const input = document.getElementById(`question_${currentQuestionIndex}`);
                    if (input) input.value = data.text;

                    currentQuestionIndex++;
                    if (currentQuestionIndex < questions.length) {
                        askNextQuestion();
                    } else {
                        console.log("✅ Todas las preguntas han sido respondidas.");
                        startCamera();
                    }
                } else {
                    console.error("⚠️ Transcripción fallida:", data.error);
                    alert("No se pudo transcribir el audio.");
                }
            }).catch(err => {
                console.error("❌ Error al enviar audio:", err);
                alert("Error al enviar el audio al servidor.");
            });
        };

        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 3000);
    }).catch(err => {
        console.error("❌ Error al acceder al micrófono:", err);
        alert("No se pudo acceder al micrófono.");
    });
}

// Función para iniciar la grabación de voz
function startSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Este navegador no soporta reconocimiento de voz.");
        return;
    }

    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = function() {
        console.log("Reconocimiento de voz iniciado.");
    };

    recognition.onresult = function(event) {
        const transcript = event.results[0][0].transcript;
        console.log(`Respuesta recibida: ${transcript}`);
        handleResponse(transcript);
    };

    recognition.onerror = function(event) {
        console.log('Error de reconocimiento de voz:', event.error);
    };

    recognition.onend = function() {
        // Si hay más preguntas, continuar
        if (currentQuestionIndex < questions.length) {
            askNextQuestion();
        } else {
            // Todas las preguntas contestadas, mostrar la cámara
            startCamera();
        }
    };

    recognition.start();
}

// Función para manejar la respuesta y colocarla en el campo correspondiente
function handleResponse(response) {
    responses.push(response);
    document.getElementById(`question_${currentQuestionIndex}`).value = response;
    currentQuestionIndex++;
}

// Función para preguntar la siguiente pregunta en voz alta
function askNextQuestion() {
    if (currentQuestionIndex < questions.length) {
        const question = questions[currentQuestionIndex];
        const utterance = new SpeechSynthesisUtterance(question);
        utterance.lang = 'es-ES';
        speechSynthesis.speak(utterance);

        utterance.onend = function() {
            console.log("🔊 Pregunta leída. Iniciando grabación...");
             // Detectar plataforma y elegir método de transcripción
            if (isIOS()) {
                setTimeout(() => {
                    startRecording();
                }, 300);
            }else{
                console.log("🤖 Usando webkitSpeechRecognition para Android/PC.");
                setTimeout(() => {
                    startSpeechRecognition(); 
                }, 300);
            }
            
        };
    }
}

//Función para detectar el tipo de dispositivo
function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Iniciar la cámara automáticamente cuando se completen las preguntas
async function startCamera() {
    const videoElement = document.getElementById('videoElement');
    const cameraContainer = document.getElementById('camera-container');
    const actionButtons = document.querySelector('.action-buttons-wrapper');

    // Ocultar/mostrar botones al inicio
    document.getElementById('start-record-btn').style.display = 'flex';
    document.getElementById('take-photo').style.display = 'flex';
    document.getElementById('stop-record-btn').style.display = 'none';

    try {
        const constraints = { video: { facingMode: 'environment' }, audio: true };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;
        videoElement.srcObject = stream;
        await videoElement.play();

        cameraContainer.style.display = 'block';
        actionButtons.style.display = 'block';
    } catch (error) {
        console.error("Error al acceder a la cámara:", error);
        alert("No se pudo acceder a la cámara. Revisa los permisos.");
        document.getElementById('activate-camera-btn').style.display = 'block';
    }
}

// Tomar la foto
/*
function takePhoto() {
    const canvas = document.getElementById('photoCanvas');
    const videoElement = document.getElementById('videoElement');

    // Validar que el video esté transmitiendo
    if (videoElement.readyState !== 4) { // 4 = HAVE_ENOUGH_DATA
        alert('La cámara no está lista. Espere un momento.');
        return;
    }

    // Dibuja la imagen del video en el canvas
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // Obtén la imagen en formato Base64
    const fotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
    // Muestra la foto como miniatura para asegurarse de que se capturó correctamente
    const photoThumbnails = document.getElementById('photoThumbnails');
    photoThumbnails.innerHTML = `
        <div class="photo-thumbnail-wrapper">
            <img src="${fotoBase64}" class="thumbnail-image">
            <div class="photo-controls">
                <button id="accept-photo" class="photo-button">✅</button>
                <button id="retake-photo" class="photo-button">❌</button>
            </div>
        </div>
    `;
    // Ocultar cámara
    videoElement.style.display = 'none';

    // Agregar listeners a los botones recién insertados
    document.getElementById('accept-photo').addEventListener('click', function () {
        // No hacer nada más, simplemente se deja la miniatura
        console.log("Foto aceptada.");
    });

    document.getElementById('retake-photo').addEventListener('click', function () {
        // Mostrar cámara de nuevo
        videoElement.style.display = 'block';
        // Limpiar miniatura y base64
        document.getElementById('photoThumbnails').innerHTML = '';
        document.getElementById('base64-photo').value = '';
    });

    // Verificar formato correcto
    if (!fotoBase64.startsWith('data:image/jpeg;base64,')) {
        throw new Error('Formato de imagen no válido');
    }
    
    // Verificar longitud mínima
    if (fotoBase64.length < 100) {
        throw new Error('La imagen es demasiado pequeña');
    }

    // Guarda la imagen como Base64 en el input para enviarla
    document.getElementById('base64-photo').value = fotoBase64;

    // Mostrar los controles de aceptar/rechazar
    //document.getElementById('photoControls').style.display = 'block';

    // Ocultar la cámara
    document.getElementById('videoElement').style.display = 'none';
}*/

/*
async function takePhoto() {
    // Primero, verifica si la cámara está apagada
    if (!isCameraActive) {
        // Si lo está, la enciende y ESPERA a que termine
        await startCamera();
        // Si startCamera falló, isCameraActive seguirá en false, y salimos.
        if (!isCameraActive) return; 
    }
    
    // Si llegamos aquí, la cámara ya está (o acaba de ser) encendida.
    // El resto es tu lógica original para tomar la foto.
    const canvas = document.getElementById('photoCanvas');
    const videoElement = document.getElementById('videoElement');
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    canvas.getContext('2d').drawImage(videoElement, 0, 0);
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
    capturedPhotos.push(photoBase64);
    addPhotoThumbnail(photoBase64, capturedPhotos.length - 1);
}*/

function takePhoto() {
    // Si la cámara no está activa, no hagas nada (esto es un seguro)
    if (!currentStream) {
        alert("La cámara no está activa. Por favor, actívala primero.");
        return;
    }

    const canvas = document.getElementById('photoCanvas');
    const videoElement = document.getElementById('videoElement');
    
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    canvas.getContext('2d').drawImage(videoElement, 0, 0);
    
    const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
    
    capturedPhotos.push(photoBase64);

    // ¡LÍNEA CRÍTICA! Esta es la que crea la miniatura.
    // Asegúrate de que esté presente.
    addPhotoThumbnail(photoBase64, capturedPhotos.length - 1);
}

const foto = document.getElementById('base64-photo').value;
console.log(foto);


// Función para agregar la miniatura de la foto
/*
function addPhotoThumbnail(photoSrc) {
    // Crear un contenedor para la miniatura
    const photoContainer = document.createElement('div');
    photoContainer.classList.add('photo-container');

    // Crear el elemento de imagen
    const img = document.createElement('img');
    img.src = photoSrc;
    img.classList.add('thumbnail');

    // Agregar el contenedor de la miniatura al área de miniaturas
    document.getElementById('photoThumbnails').appendChild(photoContainer);
}*/

/**
 * Añade una miniatura de la foto a la galería en el HTML.
 * @param {string} base64String - La imagen en formato base64.
 * @param {number} index - El índice de la foto en el array capturedPhotos.
 */
function addPhotoThumbnail(base64String, index) {
    const container = document.getElementById('photoThumbnails'); // El div que muestra las miniaturas

    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'photo-thumbnail-wrapper';
    thumbWrapper.setAttribute('data-index', index);

    thumbWrapper.innerHTML = `
        <img src="${base64String}" class="thumbnail-image">
        <div class="photo-controls">
            <button class="photo-button" onclick="deletePhoto(${index})" title="Eliminar foto">❌</button>
        </div>
    `;
    container.appendChild(thumbWrapper);
}

/**
 * Elimina una foto del array y de la vista previa.
 * @param {number} index - El índice de la foto a eliminar.
 */
function deletePhoto(index) {
    // Marcamos la foto como nula en el array en lugar de eliminarla
    // para no alterar los índices de las otras fotos.
    capturedPhotos[index] = null;

    // Buscamos y eliminamos el elemento visual de la miniatura
    const thumbnailToRemove = document.querySelector(`.photo-thumbnail-wrapper[data-index='${index}']`);
    if (thumbnailToRemove) {
        thumbnailToRemove.remove();
    }
}

//Esto es lo nuevo
/*
document.getElementById('start-record-btn').addEventListener('click', () => {
    if (!currentStream || !currentStream.active) {
        alert("ERROR: El stream de la cámara no está activo.");
        return;
    }

    try {
        // --- LÓGICA DE GRABACIÓN UNIVERSAL (Prioriza MP4) ---
        console.log("Iniciando proceso de grabación...");

        // 1. Definimos las opciones de formato. MP4 es la prioridad.
        let options = { mimeType: 'video/mp4; codecs=avc1' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.warn('MP4 no es soportado. Cambiando a WebM.');
            options = { mimeType: 'video/webm' }; // Plan B
            if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                alert("Error fatal: Ni MP4 ni WebM son soportados en este dispositivo.");
                return;
            }
        }
        
        console.log("Usando formato de grabación: ", options.mimeType);

        // 2. Usamos el método de clonación solo si es iOS para evitar la congelación.
        let streamToRecord = isIOS() ? new MediaStream([currentStream.getVideoTracks()[0].clone(), ...currentStream.getAudioTracks()]) : currentStream;

        videoChunks = [];
        videoMediaRecorder = new MediaRecorder(streamToRecord, options);

        videoMediaRecorder.onstop = () => {
            // Si el stream fue clonado (iOS), detenemos sus tracks para liberar recursos.
            if (isIOS()) {
                streamToRecord.getTracks().forEach(track => track.stop());
            }

            const videoBlob = new Blob(videoChunks, { type: options.mimeType });
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = () => {
                const videoBase64 = reader.result;
                capturedVideos.push(videoBase64);
                addVideoThumbnail(videoBase64, capturedVideos.length - 1);
            };
        };

        videoMediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) videoChunks.push(event.data);
        };

        videoMediaRecorder.start();

        // Actualizar UI
        document.getElementById('start-record-btn').style.display = 'none';
        document.getElementById('stop-record-btn').style.display = 'inline-block';
        document.getElementById('take-photo').style.display = 'none';
        document.getElementById('videoElement').classList.add('recording-active');

    } catch (error) {
        alert('ERROR al iniciar grabación: ' + error.message);
        console.error("Error detallado:", error);
    }
});*/
document.getElementById('start-record-btn').addEventListener('click', async () => {
    // Primero, verifica si la cámara está apagada
    if (!isCameraActive) {
        // Si lo está, la enciende y ESPERA a que termine
        await startCamera();
        if (!isCameraActive) return;
    }

    // Si llegamos aquí, la cámara ya está activa y podemos empezar a grabar.
    // El resto es tu lógica de grabación que ya tenías.
    // ... (tu código para crear MediaRecorder, usar isIOS(), etc.) ...
    
    // Por ejemplo:
    try {
        if (isIOS()) {
            // Lógica de clonación para iOS
        } else {
            // Lógica directa para Android/PC
        }
        // ...código común de mediaRecorder.start() y actualización de UI...
    } catch (error) {
        // ...
    }
});

document.getElementById('stop-record-btn').addEventListener('click', () => {
    if (videoMediaRecorder && videoMediaRecorder.state === 'recording') {
        videoMediaRecorder.stop();
    }
    document.getElementById('start-record-btn').style.display = 'inline-block';
    document.getElementById('stop-record-btn').style.display = 'none';
    document.getElementById('take-photo').style.display = 'inline-block'; // Mostrar de nuevo
});

document.getElementById('video-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const videoBase64 = e.target.result;
            capturedVideos.push(videoBase64);
            addVideoThumbnail(videoBase64, capturedVideos.length - 1);
        };
        reader.readAsDataURL(file);
    }
    event.target.value = ''; // Reset input
});

function addVideoThumbnail(base64String, index) {
    const container = document.createElement('div');
    container.className = 'photo-thumbnail-wrapper'; // Reutilizamos el estilo
    container.setAttribute('data-video-index', index);

    container.innerHTML = `
        <video src="${base64String}" class="thumbnail-image" controls></video>
        <div class="photo-controls">
            <button class="photo-button" onclick="deleteVideo(${index})">❌</button>
        </div>
    `;
    document.getElementById('videoThumbnails').appendChild(container);
}

function deleteVideo(index) {
    capturedVideos[index] = null; // Marcar como nulo
    const thumbnailToRemove = document.querySelector(`.photo-thumbnail-wrapper[data-video-index='${index}']`);
    if (thumbnailToRemove) {
        thumbnailToRemove.remove();
    }
}
//Hasta acá va lo nuevo

/*
document.getElementById('file-input').addEventListener('change', function (event) {
    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        const base64 = e.target.result;

        // Insertar miniatura
        const photoThumbnails = document.getElementById('photoThumbnails');
        photoThumbnails.innerHTML = `
            <div class="photo-thumbnail-wrapper">
                <img src="${base64}" class="thumbnail-image">
                <div class="photo-controls">
                    <button id="accept-photo" class="photo-button">✅</button>
                    <button id="retake-photo" class="photo-button">❌</button>
                </div>
            </div>
        `;

        // Guardar en campo oculto
        document.getElementById('base64-photo').value = base64;

        // Ocultar cámara si estaba abierta
        document.getElementById('videoElement').style.display = 'none';

        // Agregar eventos a botones
        document.getElementById('accept-photo').addEventListener('click', function () {
            console.log("Foto aceptada desde archivo.");
        });

        document.getElementById('retake-photo').addEventListener('click', function () {
            document.getElementById('videoElement').style.display = 'block';
            document.getElementById('photoThumbnails').innerHTML = '';
            document.getElementById('base64-photo').value = '';
        });
    };

    reader.readAsDataURL(file); // Convierte el archivo a base64
});*/

document.getElementById('file-input').addEventListener('change', (event) => {
    // Permite que el usuario seleccione múltiples archivos
    Array.from(event.target.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const photoBase64 = e.target.result;

            // ---- LÍNEA CLAVE A AÑADIR/CORREGIR ----
            // Añade la foto al array global
            capturedPhotos.push(photoBase64);

            // Muestra la miniatura
            addPhotoThumbnail(photoBase64, capturedPhotos.length - 1);
        };
        reader.readAsDataURL(file);
    });

    // Limpiar el input para permitir seleccionar el mismo archivo de nuevo
    event.target.value = '';
});



// Cuando estés listo para enviar la imagen al backend:
function sendPhotoData() {
    const foto = document.getElementById('base64-photo').value;

    if (foto) {
        console.log(foto); // Verifica que el Base64 es correcto

        // Realiza la solicitud POST para enviar el Base64
        fetch('/guardar-registro', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                foto: foto,
                // Agrega otros datos si es necesario
            }),
        })
        .then(response => response.json())
        .then(data => {
            console.log('Registro guardado:', data);
        })
        .catch(error => {
            console.error('Error al guardar el registro:', error);
        });
    } else {
        console.error('No se encontró la foto Base64.');
    }
}

// Función para guardar el registro
function saveRecord() {
    const saveButton = document.getElementById('save-record');
    saveButton.disabled = true;
    saveButton.textContent = "Guardando, por favor espere...";
    // Obtener el proyecto relacionado
    const projectName = document.getElementById('project-name').value;
    const fotoBase64 = document.getElementById('base64-photo').value;
    // Mostrar el mensaje de éxito inmediatamente
    document.getElementById('successMessage').style.display = 'block';

    const respuestas = {
        zona_intervencion : document.getElementById('question_0').value,
        items: document.getElementById('question_1').value,
        metros_lineales: document.getElementById('question_2').value,
        proximas_tareas: document.getElementById('question_3').value,
    };

    //LO QUE FALTABA: Recolectar las FOTOS y VIDEOS de los arrays globales
    // Estos arrays (capturedPhotos y capturedVideos) se llenan cuando tomas fotos o grabas videos.
    const finalPhotos = capturedPhotos.filter(p => p !== null);
    const finalVideos = capturedVideos.filter(v => v !== null);

    const canvas = document.getElementById('photoCanvas');
    const foto = canvas.toDataURL(); // Obtener la imagen en formato Base64
    const projectId = new URLSearchParams(window.location.search).get("project_id");

    

    // Hacer la solicitud al backend para guardar el registro
    //fetch('http://127.0.0.1:5000/guardar-registro', {
    fetch('/guardar-registro', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            respuestas: respuestas, // Tus respuestas de texto
            fotos: finalPhotos,     // El array de fotos
            videos: finalVideos,    // El array de videos que faltaba
            project_id: projectId
            //respuestas: {
                //...respuestas,
                //foto_base64: document.getElementById('base64-photo').value
            //},
            //project_id: projectId
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Limpiar campos del formulario
            document.getElementById('question_0').value = '';
            document.getElementById('question_1').value = '';
            document.getElementById('question_2').value = '';
            document.getElementById('question_3').value = '';

            // Limpiar miniatura y botón de foto
            document.getElementById('photoThumbnails').innerHTML = '';
            document.getElementById('base64-photo').value = '';

            // Limpiar canvas de foto si aplica
            const canvas = document.getElementById('photoCanvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Mostrar mensaje
            alert('¡Registro guardado exitosamente!');

            // Redirigir después de 1.5 segundos
            //setTimeout(() => {
                //window.location.href = '/registros';
            //}, 1500);
        } else {
            // Limpiar campos del formulario
            document.getElementById('question_0').value = '';
            document.getElementById('question_1').value = '';
            document.getElementById('question_2').value = '';
            document.getElementById('question_3').value = '';

            // Limpiar canvas de foto si aplica
            const canvas = document.getElementById('photoCanvas');
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            alert('¡Registro guardado exitosamente!');
            window.location.reload();
            //Código para redirigir a una página en concreto
            //window.location.href = `/historialRegistro?project_id=${projectId}&project_name=${encodeURIComponent(projectName)}`;

        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('Error en la conexión con el servidor.');
        saveButton.disabled = false;
        saveButton.textContent = "Guardar registro";
    });
}

/**
 * Inicia el proceso de grabación para un campo específico.
 * @param {HTMLElement} recordButton - El botón de micrófono que fue presionado.
 */
function startFieldRecording(recordButton) {
    if (isRecording) {
        console.warn("Ya hay una grabación en curso.");
        return; // Evita iniciar una nueva grabación si ya hay una activa
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            isRecording = true;
            audioChunks = [];
            
            // Identifica el campo de texto y el botón de parar correspondientes
            const targetInputId = recordButton.dataset.targetInput;
            currentTargetInput = document.getElementById(targetInputId);
            const stopButton = document.querySelector(`.stop-btn[data-target-input='${targetInputId}']`);

            // Actualiza la UI: oculta micrófono, muestra stop y resalta el campo
            recordButton.style.display = 'none';
            stopButton.style.display = 'flex';
            currentTargetInput.classList.add('recording-active');
            currentTargetInput.placeholder = "Escuchando...";

            // Crea y configura el MediaRecorder
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                // Detener los tracks del micrófono para que el ícono de grabación del navegador desaparezca
                stream.getTracks().forEach(track => track.stop());

                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                transcribeAudio(audioBlob);
            };
        })
        .catch(err => {
            console.error("Error al acceder al micrófono:", err);
            alert("No se pudo acceder al micrófono. Por favor, revisa los permisos.");
        });
}

/**
 * Detiene la grabación en curso.
 */
function stopFieldRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

/**
 * Envía el audio al backend y maneja la respuesta de la transcripción.
 * @param {Blob} audioBlob - El archivo de audio grabado.
 */
function transcribeAudio(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'respuesta.webm');

    // Feedback visual mientras se transcribe
    currentTargetInput.placeholder = "Transcribiendo...";

    fetch('/transcribe-audio', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.text) {
            // Si hay texto, lo añadimos al valor actual del campo
            currentTargetInput.value += (currentTargetInput.value ? ' ' : '') + data.text;
        } else {
            alert("No se pudo entender el audio. Por favor, intente de nuevo.");
        }
    })
    .catch(err => {
        console.error("Error en la transcripción:", err);
        alert("Ocurrió un error al contactar el servidor de transcripción.");
    })
    .finally(() => {
        // Restaura la UI sin importar si hubo éxito o error
        const targetInputId = currentTargetInput.id;
        const recordButton = document.querySelector(`.record-btn[data-target-input='${targetInputId}']`);
        const stopButton = document.querySelector(`.stop-btn[data-target-input='${targetInputId}']`);

        recordButton.style.display = 'flex';
        stopButton.style.display = 'none';
        currentTargetInput.classList.remove('recording-active');
        currentTargetInput.placeholder = "";

        // Resetea el estado global
        isRecording = false;
        currentTargetInput = null;
    });
}
// =================================================================
//          4. INICIALIZACIÓN DE EVENTOS
// =================================================================

// Usamos 'DOMContentLoaded' para asegurarnos de que todo el HTML está cargado
document.addEventListener('DOMContentLoaded', () => {
    // --- Eventos para la cámara principal ---
    document.getElementById('activate-camera-btn').addEventListener('click', () => {
        startCamera();
        document.getElementById('activate-camera-btn').style.display = 'none';
    });

    document.getElementById('start-record-btn').addEventListener('click', startVideoRecording);
    document.getElementById('stop-record-btn').addEventListener('click', stopVideoRecording);

    // --- Eventos para adjuntar archivos ---
    document.getElementById('file-input').addEventListener('change', handleFileUpload);
    document.getElementById('video-file-input').addEventListener('change', handleVideoUpload);

    // --- Eventos para grabación de audio por campo ---
    document.querySelectorAll('.record-btn').forEach(button => {
        button.addEventListener('click', () => startFieldRecording(button));
    });

    document.querySelectorAll('.stop-btn').forEach(button => {
        button.addEventListener('click', stopFieldRecording);
    });
});


document.getElementById('successMessage').style.display = 'block';

function startVideoRecording() {
    if (!currentStream) {
        alert("La cámara no está activa.");
        return;
    }
    try {
        let options = { mimeType: 'video/mp4; codecs=avc1' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'video/webm' };
        }
        let streamToRecord = isIOS() ? new MediaStream([currentStream.getVideoTracks()[0].clone(), ...currentStream.getAudioTracks()]) : currentStream;
        videoChunks = [];
        videoMediaRecorder = new MediaRecorder(streamToRecord, options);
        videoMediaRecorder.onstop = () => {
            if (isIOS()) streamToRecord.getTracks().forEach(track => track.stop());
            const videoBlob = new Blob(videoChunks, { type: options.mimeType });
            const reader = new FileReader();
            reader.readAsDataURL(videoBlob);
            reader.onloadend = () => {
                capturedVideos.push(reader.result);
                addVideoThumbnail(reader.result, capturedVideos.length - 1);
            };
        };
        videoMediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) videoChunks.push(event.data);
        };
        videoMediaRecorder.start();
        updateRecordingUI(true);
    } catch (error) {
        alert('ERROR al iniciar grabación: ' + error.message);
    }
}

function stopVideoRecording() {
    if (videoMediaRecorder && videoMediaRecorder.state === 'recording') {
        videoMediaRecorder.stop();
    }
    updateRecordingUI(false);
}

function updateRecordingUI(isRecordingActive) {
    document.getElementById('videoElement').classList.toggle('recording-active', isRecordingActive);
    document.getElementById('start-record-btn').style.display = isRecordingActive ? 'none' : 'flex';
    document.getElementById('stop-record-btn').style.display = isRecordingActive ? 'flex' : 'none';
    document.getElementById('take-photo').style.display = isRecordingActive ? 'none' : 'flex';
}

// Empezar el proceso de preguntas en cuanto cargue la página
/*window.onload = function() {
    setTimeout(() => {
        askNextQuestion();
    }, 1000); // 1000 milisegundos = 1 segundo
};*/

document.getElementById('start-register-button').addEventListener('click', function () {
    console.log("Inicio de registro activado por el usuario");
    askNextQuestion();
});


// Abrir modal al presionar "Adjuntar plano"
//attachBtn.addEventListener("click", () => {
    //fileModal.style.display = "block";
//});

// Cerrar modal al presionar la "X"
//closeModal.addEventListener("click", () => {
    //fileModal.style.display = "none";
//});

function triggerFileInput() {
    document.getElementById('file-input').click();
}

document.getElementById('switch-camera').addEventListener('click', function () {
    // Alternar entre "user" y "environment"
    currentFacingMode = (currentFacingMode === "environment") ? "user" : "environment";
    startCamera(currentFacingMode);
});


