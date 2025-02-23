from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import pipeline, AutoTokenizer, M2M100Tokenizer, M2M100ForConditionalGeneration
import torch
from torchvision import transforms, models
from PIL import Image
import io
from langdetect import detect

# Initialize the FastAPI app
app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration constants
MODEL_PATH = "./chest_disease_model.pth"
MAX_LENGTH = 1000
MIN_LENGTH = 100
TEMPERATURE = 0.8
TOP_P = 0.95
REPETITION_PENALTY = 1.2
LENGTH_PENALTY = 1.0

# Load models in functions for better error handling
def load_chatbot():
    try:
        return pipeline(
            "text-generation",
            model="./fine_tuned_medical_chatbot",
            tokenizer="./fine_tuned_medical_chatbot",
            device=-1,
            truncation=True
        )
    except Exception as e:
        print(f"Error loading chatbot model: {e}")
        return None

def load_disease_model():
    try:
        # First, let's print the state dict keys to see what we're working with
        state_dict = torch.load(MODEL_PATH, map_location=torch.device("cpu"))
        # print("Keys in state dict:", state_dict.keys())
        
        # Use DenseNet model
        model = models.densenet121(pretrained=False)
        
        # Modify the final layer for your number of classes
        num_classes = 2  # Adjust this based on your actual number of classes
        model.classifier = torch.nn.Linear(model.classifier.in_features, num_classes)
        
        # Load the state dictionary with strict=False to see if it works
        model.load_state_dict(state_dict, strict=False)
        
        model.eval()
        return model
    except Exception as e:
        print(f"Error loading disease model: {e}")
        return None

def load_translation_model():
    try:
        model_name = "facebook/m2m100_418M"
        tokenizer = M2M100Tokenizer.from_pretrained(model_name)
        model = M2M100ForConditionalGeneration.from_pretrained(model_name)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model.to(device)
        return model, tokenizer, device
    except Exception as e:
        print(f"Error loading translation model: {e}")
        return None, None, None

chatbot = load_chatbot()
model = load_disease_model()
translation_model, translation_tokenizer, translation_device = load_translation_model()

# Define a request model for incoming chat messages.
class ChatRequest(BaseModel):
    message: str
    language: str = None  # Now optional, will be auto-detected if not provided

# Define image transformations (modify according to your model)
transform = transforms.Compose([
    transforms.Resize((224, 224)),  # Resize to model input size
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])

# Define request models
class TranslationRequest(BaseModel):
    text: str
    src_lang: str
    tgt_lang: str

@app.post("/chat")
async def chat(request: ChatRequest) -> dict:
    if not chatbot:
        return {"error": "Chatbot model not loaded properly"}
    
    try:
        # Map common language names to ISO codes (only M2M100 supported languages)
        language_map = {
            # Common international languages
            "english": "en",
            "spanish": "es",
            
            # Indian languages supported by M2M100
            "hindi": "hi",
            "bengali": "bn",
            "tamil": "ta",
            "telugu": "te",
            "marathi": "mr",
            "urdu": "ur",
            "gujarati": "gu",
            "kannada": "kn",
            "malayalam": "ml",
            "punjabi": "pa",
            "nepali": "ne"
        }
        
        # Convert language name to code, default to English if not found
        input_language = language_map.get(request.language.lower(), "en")
        
        # Process directly if input is English
        input_text = request.message
        if input_language != "en":
            input_text = translate(request.message, input_language, "en")
        
        # Process with chatbot
        instruction = "DONOT MENTION ANY DOCTOR'S NAME OR TELL WHO YOU ARE. DON'T MENTION THE SHINAS HUSSAIN, HCM, ANY COMPANY, OR ANYTHING like GENERAL AND FAMILY. IF IT'S ASKING FOR A PLAN, MAKE SO. CONSIDER YOURSELF A DOCTOR NAMED AWESOME DOC, AND REPLY WITH THAT IN MIND."
        formatted_input = f"{instruction}{input_text}\nDoctor:"
        
        response = chatbot(
            formatted_input,
            max_length=MAX_LENGTH,
            min_length=MIN_LENGTH,
            do_sample=True,
            top_p=TOP_P,
            temperature=TEMPERATURE,
            pad_token_id=chatbot.tokenizer.eos_token_id,
            repetition_penalty=REPETITION_PENALTY,
            length_penalty=LENGTH_PENALTY,
            truncation=True
        )
        
        generated_text = response[0]['generated_text']
        doctor_reply = generated_text.split("Doctor:")[-1].strip() if "Doctor:" in generated_text else generated_text.strip()
        
        # Only translate back if the original input wasn't in English
        if input_language != "en":
            doctor_reply = translate(doctor_reply, "en", input_language)
            
        return {"reply": doctor_reply}
    
    except Exception as e:
        return {"error": f"Error generating response: {str(e)}"}


# Endpoint for prediction
@app.post("/predict/")
async def predict(file: UploadFile = File(...)) -> dict:
    if not model:
        return {"error": "Disease model not loaded properly"}
    
    try:
        image = Image.open(io.BytesIO(await file.read())).convert("RGB")
        image = transform(image).unsqueeze(0)
        
        with torch.no_grad():
            output = model(image)
            predicted_class = torch.argmax(output, dim=1).item()
        
        return {"prediction": predicted_class}
    
    except Exception as e:
        return {"error": f"Error processing image: {str(e)}"}

def translate(text: str, src_lang: str, tgt_lang: str) -> str:
    if not translation_model or not translation_tokenizer:
        raise Exception("Translation model not loaded properly")
    
    translation_tokenizer.src_lang = src_lang
    inputs = translation_tokenizer(text, return_tensors="pt").to(translation_device)
    generated_tokens = translation_model.generate(
        **inputs, 
        forced_bos_token_id=translation_tokenizer.get_lang_id(tgt_lang)
    )
    return translation_tokenizer.batch_decode(generated_tokens, skip_special_tokens=True)[0]

@app.post("/translate")
async def translate_text(request: TranslationRequest) -> dict:
    try:
        translated_text = translate(request.text, request.src_lang, request.tgt_lang)
        return {"translated_text": translated_text}
    except Exception as e:
        return {"error": f"Error in translation: {str(e)}"}

@app.get("/")
async def root():
    return {"message": "Medical Chatbot API is up and running!"}